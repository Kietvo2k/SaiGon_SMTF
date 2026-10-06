#!/usr/bin/env python3
"""Local preview; capture endpoint accepts only PNGs and bounded filenames."""
import http.server,pathlib,json,base64,re,functools,hashlib,os
ROOT=pathlib.Path(__file__).resolve().parent.parent
class Handler(http.server.SimpleHTTPRequestHandler):
 _etag_cache={}
 def send_head(self):
  path=pathlib.Path(self.translate_path(self.path))
  if not path.is_file():return super().send_head()
  try:
   f=path.open('rb');st=os.fstat(f.fileno());size=st.st_size
   key=(str(path),st.st_mtime_ns,size,st.st_ino)
   etag=self._etag_cache.get(key)
   if etag is None:
    digest=hashlib.sha256()
    for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk)
    etag='"'+digest.hexdigest()+'"'
    if len(self._etag_cache)>256:self._etag_cache.clear()
    self._etag_cache[key]=etag;f.seek(0)
   self._range=None
   if self.headers.get('If-None-Match') in (etag,'*'):
    self.send_response(304);self.send_header('ETag',etag);self.end_headers();f.close();return None
   start,end=0,size-1
   value=self.headers.get('Range')
   if value and self.headers.get('If-Range',etag)==etag:
    match=re.fullmatch(r'bytes=([0-9]{0,20})-([0-9]{0,20})',value.strip())
    valid=bool(match and (match[1] or match[2]) and size)
    if valid:
     if not match[1]:
      suffix=int(match[2]);valid=suffix>0;start=max(0,size-suffix)
     else:
      start=int(match[1]);end=min(int(match[2]),size-1) if match[2] else size-1;valid=start<size and start<=end
    if not valid:
     self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.send_header('Accept-Ranges','bytes');self.send_header('ETag',etag);self.end_headers();f.close();return None
    self._range=(start,end);f.seek(start)
   self.send_response(206 if self._range else 200)
   self.send_header('Content-Type',self.guess_type(str(path)));self.send_header('Content-Length',str(end-start+1))
   self.send_header('Accept-Ranges','bytes');self.send_header('ETag',etag);self.send_header('Last-Modified',self.date_time_string(st.st_mtime))
   if self._range:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
   self.end_headers();return f
  except OSError:
   self.send_error(404,'File not found');return None
 def copyfile(self,source,outputfile):
  if not getattr(self,'_range',None):return super().copyfile(source,outputfile)
  remaining=self._range[1]-self._range[0]+1
  while remaining:
   block=source.read(min(65536,remaining))
   if not block:break
   outputfile.write(block);remaining-=len(block)
 def do_POST(self):
  m=re.fullmatch(r'/capture/(poc-[a-z-]+)',self.path)
  try:size=int(self.headers.get('Content-Length','0'))
  except ValueError:self.send_error(400);return
  if not m or not 0<size<20_000_000:self.send_error(400);return
  try:
   data=json.loads(self.rfile.read(size));raw=base64.b64decode(data['image'].split(',',1)[1]);assert raw[:8]==b'\x89PNG\r\n\x1a\n'
   (ROOT/(m[1]+'.png')).write_bytes(raw);(ROOT/(m[1]+'.metrics.json')).write_text(json.dumps(data.get('metrics',{}),indent=2))
   self.send_response(200);self.end_headers();self.wfile.write(b'OK')
  except Exception:self.send_error(400)
if __name__=='__main__':
 port=int(os.environ.get('PORT','8768'))  # PORT tùy chọn để chạy song song; mặc định giữ 8768
 print(f'Open http://127.0.0.1:{port}/hcmc-poc/',flush=True)
 # Backlog mặc định 5: trang chuyển hướng hủy hàng chục request rồi nạp lại làm Windows trả ERR_CONNECTION_REFUSED.
 http.server.ThreadingHTTPServer.request_queue_size=128
 http.server.ThreadingHTTPServer(('127.0.0.1',port),functools.partial(Handler,directory=str(ROOT))).serve_forever()
