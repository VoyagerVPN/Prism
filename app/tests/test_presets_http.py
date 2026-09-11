import json
import urllib.request
import urllib.error
import uuid

url = 'http://127.0.0.1:8188/prism/presets'
def request(body=None):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()

status, original = request()
assert status == 200, (status, original)
name = '__test_' + uuid.uuid4().hex
preset = dict(checkpoint='test.safetensors',steps=37,cfg=8,sampler='euler',scheduler='normal',advancedToggle=True,clipSkip=2,vae='None')
created = False
try:
    status, saved = request({'presets':{**original['presets'],name:preset},'revision':original['revision']})
    assert status == 200, (status,saved)
    created = True
    assert request()[1]['presets'][name] == preset
    assert request({'presets':{},'revision':original['revision']})[0] == 409
    for invalid in ({**preset,'positive':'Не сохранять'}, {**preset,'cfg':True}, {**preset,'steps':-1}):
        assert request({'presets':{name:invalid},'revision':saved['revision']})[0] == 400
    assert request()[1] == saved
    print('JSON save/read, revision conflict and invalid data rejection: OK')
finally:
    if created:
        status,current=request()
        del current['presets'][name]
        assert request(current)[0] == 200
