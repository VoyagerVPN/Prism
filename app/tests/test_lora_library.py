from pathlib import Path
import tempfile,json,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lora_library import local_entry,preview_path
root=Path(__file__).resolve().parents[1]/'.cache'
with tempfile.TemporaryDirectory(dir=root) as directory:
    path=Path(directory)/'test.safetensors';path.write_bytes(b'test')
    path.with_suffix('.cm-info.json').write_text(json.dumps({'ModelId':123,'VersionId':456,'ModelName':'Test model','BaseModel':'Illustrious','TrainedWords':['actual trigger'],'ModelDescription':'<p>Hello</p><script>bad()</script>','AuthorUsername':'Artist','Tags':['style']}))
    path.with_suffix('.preview.jpeg').write_bytes(b'preview')
    entry=local_entry('Style/test.safetensors',path,{'triggers':[],'base_model':'unknown'})
    assert entry['title']=='Test model' and entry['triggers']==['actual trigger']
    assert entry['url']=='https://civitai.com/models/123?modelVersionId=456'
    assert entry['description'].strip()=='Hello' and entry['author']=='Artist'
    assert preview_path(path)==path.with_suffix('.preview.jpeg')
    path.with_suffix('.cm-info.json').write_text('broken')
    entry=local_entry('Style/test.safetensors',path,{'triggers':['from header'],'base_model':'sdxl'})
    assert entry['title']=='test' and entry['triggers']==['from header'] and entry['warning']
print('Local Civitai metadata, preview, safe description and broken-sidecar fallback: OK')
