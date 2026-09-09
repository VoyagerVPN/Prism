import sys,types,importlib.util,unittest,tempfile,struct,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
class Routes:
 def get(self,*a):return lambda f:f
 def post(self,*a):return lambda f:f
 def __iter__(self):return iter([])
sys.modules['server']=types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=Routes())))
sys.modules['folder_paths']=types.SimpleNamespace()
spec=importlib.util.spec_from_file_location('dashboard',Path(__file__).resolve().parents[1]/'__init__.py',submodule_search_locations=[str(Path(__file__).resolve().parents[1])])
dashboard=importlib.util.module_from_spec(spec);sys.modules['dashboard']=dashboard;spec.loader.exec_module(dashboard)
class Checks(unittest.IsolatedAsyncioTestCase):
 async def test_runtime_identifies_prism(self):
  response=await dashboard.get_runtime(None)
  self.assertEqual(json.loads(response.text),{'service':'prism','version':1})
 async def test_import_http_upload_and_duplicate(self):
  from aiohttp import web, FormData
  from aiohttp.test_utils import TestClient, TestServer
  cache=Path(__file__).resolve().parents[1]/'.cache'
  with tempfile.TemporaryDirectory(dir=cache) as directory:
   original=dashboard.folder_paths
   dashboard.folder_paths=types.SimpleNamespace(get_folder_paths=lambda kind:[directory],filename_list_cache={})
   app=web.Application()
   app.router.add_post('/analyze',dashboard.analyze_model_import)
   app.router.add_post('/upload',dashboard.upload_model_import)
   header={'__metadata__':{'ss_base_model_version':'sdxl_base_v1-0','category':'Character'},'lora_x.lora_down.weight':{'dtype':'F32','shape':[1],'data_offsets':[0,4]}}
   raw=json.dumps(header).encode();binary=struct.pack('<Q',len(raw))+raw+b'\0'*4
   try:
    async with TestClient(TestServer(app)) as client:
     result=await (await client.post('/analyze',json={'header':header,'name':'test.safetensors'})).json()
     self.assertEqual((result['base'],result['category']),('SDXL','Character'))
     async def upload(payload=binary):
      form=FormData()
      for key,value in [('kind','loras'),('base','SDXL'),('category','Character')]:form.add_field(key,value)
      form.add_field('file',payload,filename='test.safetensors',content_type='application/octet-stream')
      return await client.post('/upload',data=form)
     result=await upload()
     self.assertEqual(result.status,200,await result.text())
     self.assertEqual((await result.json())['name'],'Character/SDXL/test.safetensors')
     self.assertEqual((await upload()).status,409)
     self.assertEqual((await upload(b'broken')).status,400)
     self.assertEqual((Path(directory)/'Character/SDXL/test.safetensors').read_bytes(),binary)
     self.assertEqual(list(Path(directory).glob('*.part')),[])
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
    chars={'Тест':{'name':'Тест','lora':'None','strength':1.0,'appearance':'Описание','outfits':{'Обычный':'Куртка'},'activeOutfitName':'Обычный','outfitEnabled':True}}
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

