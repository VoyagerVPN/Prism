import sys,types,importlib.util,unittest,tempfile,struct,json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
class Routes:
 def __init__(self):self.items=[]
 def register(self,method,path):
  def decorator(function):self.items.append(types.SimpleNamespace(method=method,path=path));return function
  return decorator
 def get(self,path):return self.register('GET',path)
 def post(self,path):return self.register('POST',path)
 def patch(self,path):return self.register('PATCH',path)
 def __iter__(self):return iter(self.items)
sys.modules['server']=types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=Routes())))
sys.modules['folder_paths']=types.SimpleNamespace()
spec=importlib.util.spec_from_file_location('dashboard',Path(__file__).resolve().parents[1]/'__init__.py',submodule_search_locations=[str(Path(__file__).resolve().parents[1])])
dashboard=importlib.util.module_from_spec(spec);sys.modules['dashboard']=dashboard;spec.loader.exec_module(dashboard)
class Checks(unittest.IsolatedAsyncioTestCase):
 def test_routes_use_only_prism_prefix(self):
  paths=[route.path for route in dashboard.routes]
  self.assertIn('/prism',paths)
  self.assertIn('/prism/characters',paths)
  self.assertIn('/prism/metrics',paths)
  legacy_prefix='/'+'dashboard'
  self.assertFalse(any(path.startswith(legacy_prefix) for path in paths),paths)
 async def test_library_category_persists_without_renaming_model(self):
  from aiohttp import web
  from aiohttp.test_utils import TestClient, TestServer
  with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]/'.cache') as directory:
   root=Path(directory);name='Other\\anima\\slavya.safetensors';path=root/'slavya.safetensors';path.write_bytes(b'weights unchanged')
   original=dashboard.folder_paths
   dashboard.folder_paths=types.SimpleNamespace(get_filename_list=lambda kind:[name],get_full_path=lambda kind,key:str(path) if key==name else None)
   app=web.Application();app.router.add_get('/library',dashboard.get_lora_library);app.router.add_post('/category',dashboard.set_lora_category);app.router.add_post('/lookup',dashboard.lookup_lora_library)
   def metadata_update(*args):path.with_suffix('.cm-info.json').write_text(json.dumps({'ModelName':'Slavya updated','Tags':['character']}))
   try:
    with patch.object(dashboard.lora_library,'CATEGORY_PATH',root/'library-categories.json'),patch.object(dashboard,'get_lora_metadata',return_value={'base_model':'anima','triggers':[]}):
     async with TestClient(TestServer(app)) as client:
      initial=(await (await client.get('/library')).json())['items'][0]
      self.assertEqual(initial['category'],'Other')
      result=await client.post('/category',json={'name':name,'category':'Character'})
      self.assertEqual(result.status,200,await result.text());self.assertEqual((await result.json())['category'],'Character')
      saved=(await (await client.get('/library')).json())['items'][0]
      self.assertEqual((saved['name'],saved['category']),(name,'Character'))
      with patch.object(dashboard.lora_library,'lookup',side_effect=metadata_update):
       updated=await (await client.post('/lookup',json={'name':name})).json()
      self.assertEqual((updated['title'],updated['category']),('Slavya updated','Character'))
      self.assertEqual((await client.post('/category',json={'name':name,'category':'Fake'})).status,400)
      self.assertEqual((await client.post('/category',json={'name':'../outside.safetensors','category':'Character'})).status,400)
      self.assertEqual((await client.post('/category',json={'name':name,'category':'Style'})).status,200)
      self.assertEqual((await (await client.get('/library')).json())['items'][0]['category'],'Style')
      self.assertEqual(path.read_bytes(),b'weights unchanged')
   finally:dashboard.folder_paths=original
 async def test_runtime_identifies_prism(self):
  response=await dashboard.get_runtime(None)
  self.assertEqual(json.loads(response.text),{'service':'prism','version':1})
 async def test_metrics_endpoint_returns_process_snapshot_without_cache(self):
  snapshot={'process':{'pid':321,'ram':{'used':10,'capacity':100}},'devices':[]}
  with patch.object(dashboard,'collect_runtime_metrics',return_value=snapshot):
   response=await dashboard.get_metrics(None)
  self.assertEqual(json.loads(response.text),snapshot)
  self.assertEqual(response.headers['Cache-Control'],'no-store')
 async def test_import_http_upload_and_duplicate(self):
  from aiohttp import web, FormData
  from aiohttp.test_utils import TestClient, TestServer
  cache=Path(__file__).resolve().parents[1]/'.cache'
  with tempfile.TemporaryDirectory(dir=cache) as directory:
   original=dashboard.folder_paths
   original_bases=dashboard.import_bases_path
   dashboard.import_bases_path=Path(directory)/'import-bases.json'
   dashboard.folder_paths=types.SimpleNamespace(get_folder_paths=lambda kind:[directory],filename_list_cache={})
   app=web.Application()
   app.router.add_post('/analyze',dashboard.analyze_model_import)
   app.router.add_post('/upload',dashboard.upload_model_import)
   header={'__metadata__':{'ss_base_model_version':'sdxl_base_v1-0','category':'Character'},'lora_x.lora_down.weight':{'dtype':'F32','shape':[1],'data_offsets':[0,4]}}
   raw=json.dumps(header).encode();binary=struct.pack('<Q',len(raw))+raw+b'\0'*4
   try:
    async with TestClient(TestServer(app)) as client:
     result=await (await client.post('/analyze',json={'header':header,'name':'test.safetensors'})).json()
     self.assertEqual((result['base'],result['category']),('sdxl_base_v1-0','Character'))
     self.assertEqual(result['bases'],[])
     async def upload(payload=binary,base='SDXL'):
      form=FormData()
      for key,value in [('kind','loras'),('base',base),('category','Character')]:form.add_field(key,value)
      form.add_field('file',payload,filename='test.safetensors',content_type='application/octet-stream')
      return await client.post('/upload',data=form)
     result=await upload()
     self.assertEqual(result.status,200,await result.text())
     self.assertEqual((await result.json())['name'],'Character/SDXL/test.safetensors')
     self.assertEqual((await upload()).status,409)
     self.assertEqual((await upload(b'broken')).status,400)
     self.assertEqual((Path(directory)/'Character/SDXL/test.safetensors').read_bytes(),binary)
     self.assertEqual(list(Path(directory).glob('*.part')),[])
     self.assertEqual((await upload(base='Моя база v3')).status,200)
     self.assertEqual(dashboard.get_lora_metadata(str(Path(directory)/'Character/Моя база v3/test.safetensors'))['base_model'],'Моя база v3')
     result=await (await client.post('/analyze',json={'header':header,'name':'next.safetensors'})).json()
     self.assertEqual(result['bases'],['SDXL','Моя база v3'])
   finally:
    dashboard.folder_paths=original
    dashboard.import_bases_path=original_bases
 async def test_reveal_lora_opens_only_registered_file(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]/'.cache') as directory:
   path=Path(directory)/'Character'/'test.safetensors';path.parent.mkdir();path.write_bytes(b'test')
   original=dashboard.folder_paths
   dashboard.folder_paths=types.SimpleNamespace(
    get_filename_list=lambda kind:['Character/test.safetensors'],
    get_full_path=lambda kind,name:str(path) if name=='Character/test.safetensors' else None,
   )
   async def request(name):
    return await dashboard.reveal_lora_file(types.SimpleNamespace(query={'name':name}))
   try:
    with patch.object(dashboard.subprocess,'Popen') as launch:
     self.assertEqual((await request('Character/test.safetensors')).status,204)
     launch.assert_called_once_with(['explorer.exe',f'/select,{path}'])
     self.assertEqual((await request('../prism.json')).status,400)
   finally:dashboard.folder_paths=original
 async def test_characters_persist_and_reject_stale_writes(self):
  cache=Path(__file__).resolve().parents[1]/'.cache';cache.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(dir=cache) as directory:
   original=dashboard.character_path
   dashboard.character_path=Path(directory)/'characters.json'
   try:
    initial=json.loads((await dashboard.get_characters(None)).text)
    async def save(data):
     async def body():return data
     return await dashboard.post_characters(types.SimpleNamespace(json=body))
    chars={'Тест':{'name':'Тест','universe':'Тестовый мир','description':'Заметки','lora':'None','strength':1.0,'appearance':'Описание','outfits':{'Обычный':'Куртка'},'activeOutfitName':'Обычный','outfitEnabled':True,'source':{'author':'Автор','url':'https://example.com/model','triggers':['hero']}}}
    response=await save({'revision':initial['revision'],'characters':chars})
    self.assertEqual(response.status,200)
    self.assertEqual(json.loads((await dashboard.get_characters(None)).text)['characters'],chars)
    self.assertEqual((await save({'revision':initial['revision'],'characters':{}})).status,409)
    revision=json.loads(response.text)['revision']
    self.assertEqual((await save({'revision':revision,'characters':[]})).status,400)
    self.assertEqual((await save({'revision':revision,'characters':{}})).status,200)
    self.assertEqual(json.loads(dashboard.character_path.with_suffix('.json.bak').read_text(encoding='utf-8')),chars)
    dashboard.character_path.write_text('broken',encoding='utf-8')
    self.assertEqual((await save({'revision':revision,'characters':{}})).status,500)
    self.assertEqual(dashboard.character_path.read_text(encoding='utf-8'),'broken')
   finally:dashboard.character_path=original
 async def test_presets_persist_and_reject_stale_writes(self):
  cache=Path(__file__).resolve().parents[1]/'.cache';cache.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(dir=cache) as directory:
   original=dashboard.preset_path
   dashboard.preset_path=Path(directory)/'model-presets.json'
   try:
    initial=json.loads((await dashboard.get_presets(None)).text)
    async def save(data):
     async def body():return data
     return await dashboard.post_presets(types.SimpleNamespace(json=body))
    preset={'checkpoint':'model.safetensors','steps':30,'cfg':4,'sampler':'er_sde','scheduler':'simple','advancedToggle':True,'clipSkip':1,'vae':'None'}
    response=await save({'revision':initial['revision'],'presets':{'Anima':preset}})
    self.assertEqual(response.status,200)
    self.assertEqual(json.loads((await dashboard.get_presets(None)).text)['presets'],{'Anima':preset})
    self.assertEqual((await save({'revision':initial['revision'],'presets':{}})).status,409)
    revision=json.loads(response.text)['revision']
    self.assertEqual((await save({'revision':revision,'presets':{'Anima':{**preset,'cfg':True}}})).status,400)
    self.assertEqual((await save({'revision':revision,'presets':{}})).status,200)
    self.assertEqual(json.loads(dashboard.preset_path.with_suffix('.json.bak').read_text(encoding='utf-8')),{'Anima':preset})
    dashboard.preset_path.write_text('broken',encoding='utf-8')
    self.assertEqual((await save({'revision':revision,'presets':{}})).status,500)
    self.assertEqual(dashboard.preset_path.read_text(encoding='utf-8'),'broken')
   finally:dashboard.preset_path=original
 async def test_static_private_files_are_not_served(self):
  for name in ['.git/config','.cache/verification/reference-workflow.json','Start.ps1','__init__.py','../config.js']:
   response=await dashboard.get_dashboard_static(types.SimpleNamespace(match_info={'filename':name}))
   self.assertEqual(response.status,404,name)
  response=await dashboard.get_dashboard_static(types.SimpleNamespace(match_info={'filename':'main.js'}))
  self.assertEqual(response.status,200)
 def test_training_frequency_is_not_a_trigger(self):
  cache=Path(__file__).resolve().parents[1]/'.cache';cache.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(dir=cache) as directory:
   path=Path(directory)/'lora.safetensors'
   metadata={'__metadata__':{'ss_trained_words':'["actual trigger"]','ss_tag_frequency':'{"set":{"unrelated tag":20}}'}}
   header=json.dumps(metadata).encode();path.write_bytes(struct.pack('<Q',len(header))+header)
   self.assertEqual(dashboard.get_lora_metadata(str(path))['triggers'],['actual trigger'])
if __name__=='__main__':unittest.main()

