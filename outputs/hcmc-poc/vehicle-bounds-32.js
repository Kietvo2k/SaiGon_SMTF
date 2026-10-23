// Ma trận pose có trục X dọc xe, Y thẳng đứng, Z ngang xe; scale không đổi vị trí bám đường.
export const BOX_HEIGHTS_32 = [1.8,1.6,3.5,3.1];
export function scaleVehicleBox32(matrix,offset,length,width,height) {
  for(let k=0;k<3;k++) { matrix[offset+k]*=length; matrix[offset+4+k]*=height; matrix[offset+8+k]*=width; }
}
// Camera bằng chứng chạy drawFor() sau camera chính; khung bao chỉ thuộc cảnh chính.
// Tách hàm để test được và để drawFor không vô tình xóa khung bao đang bật.
export function isMainVehicleCamera32(cam, mainCamera) {
  return !!cam && cam === mainCamera;
}
