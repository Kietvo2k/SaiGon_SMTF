import { describe, expect, it, vi } from 'vitest';
import { lookupPlate, resolveApiUrl, requestCamera } from './api';

describe('VERCEL-SUBMIT-DATA · /api/demo', () => {
  it('uses same-origin demo API and handles a shared seed for dashed and compact plates', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({plate:'51K-123.45', records:[{plate:'51K-123.45',summary:'Vi phạm tín hiệu (mẫu)',status:'confirmed'}]}), {status:200})));
    expect(resolveApiUrl('/api/demo/lookup')).toBe('/api/demo/lookup');
    expect((await lookupPlate('51K-123.45', fetcher)).records).toHaveLength(1);
    expect((await lookupPlate('51K12345', fetcher)).records).toHaveLength(1);
    expect(fetcher.mock.calls.map(c=>String(c[0]))).toEqual(['/api/demo/lookup?plate=51K-123.45','/api/demo/lookup?plate=51K-123.45']);
  });
  it('distinguishes valid-empty, invalid input and upstream failure', async () => {
    const empty=await lookupPlate('51K98765', async()=>new Response('{"plate":"51K-987.65","records":[]}',{status:200}));
    expect(empty.records).toEqual([]);
    await expect(lookupPlate('VAN-BAN', fetch)).rejects.toMatchObject({code:'INVALID_PLATE',status:400});
    await expect(lookupPlate('51K12345', async()=>new Response('{"error":{"code":"DATA_UNAVAILABLE","message":"Unavailable"}}',{status:503}))).rejects.toMatchObject({code:'DATA_UNAVAILABLE',status:503});
  });
  it('preserves the authoritative camera IDs and rejects metadata from a different camera', async () => {
    const camera={cameraId:'CAM-BAC-003',junctionId:'Bac-03',label:'Bắc 03'};
    const read=vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ...camera, source:'sample',frameId:'sample-CAM-BAC-003',capturedAt:null,imageUrl:'/api/demo/media?cameraId=CAM-BAC-003&frameId=sample-CAM-BAC-003' }), {status:200})));
    expect(await requestCamera(camera,read)).toMatchObject(camera);
    expect(read.mock.calls[0][0]).toBe('/api/demo/camera?cameraId=CAM-BAC-003');
    await expect(requestCamera(camera,async()=>new Response(JSON.stringify({...camera,cameraId:'CAM-BAC-002'}),{status:200}))).rejects.toMatchObject({code:'CAMERA_ID_MISMATCH'});
  });
});
