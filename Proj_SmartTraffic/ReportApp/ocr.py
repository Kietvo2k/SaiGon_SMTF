import Quartz
import Vision
from CoreFoundation import CFURLCreateWithFileSystemPath, kCFURLPOSIXPathStyle

def recognize_text(image_path):
    url = CFURLCreateWithFileSystemPath(None, image_path, kCFURLPOSIXPathStyle, False)
    request_handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(url, None)
    
    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    
    success, error = request_handler.performRequests_error_([request], None)
    
    if success:
        for observation in request.results():
            bbox = observation.boundingBox()
            print(f"Text: '{observation.topCandidates_(1)[0].string()}' BBox: (x={bbox.origin.x:.3f}, y={bbox.origin.y:.3f}, w={bbox.size.width:.3f}, h={bbox.size.height:.3f})")

recognize_text('assets/images/cccd_template.jpg')
