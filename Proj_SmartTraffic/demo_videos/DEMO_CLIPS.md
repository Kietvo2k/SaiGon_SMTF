# Demo video clips

## Red-light evidence/OCR candidate

`violation_redlight_15s_ccby4.mp4` is a 15-second H.264 clip at 1280x720 and
15 FPS. It is derived from 00:03-00:18 of `rlr_occasions_cc_by_4.mp4` and is
intended for the red-light-event and evidence pipeline.

## Jetson hardware candidate

`jetson_redlight_15s_640x360_10fps_ccby4.mp4` contains the same 15-second
scene at 640x360 and 10 FPS. It is intended for an efficient looped Jetson
Nano traffic-light / 7-segment display demonstration.

## Attribution and responsible use

Both derived clips retain the attribution of their source: Tiago Silva,
*Dataset for Traffic Evaluation*, Zenodo (2024), CC BY 4.0,
DOI 10.5281/zenodo.14041920. They are demonstration/evaluation data, not a
real enforcement record. Do not claim a plate number when the OCR confidence
or image quality is insufficient.

## Rain / blurred-visibility heatmap candidate

`rain_blur_12s_640x360_10fps_pexels.mp4` is a lightweight 12-second H.264
input clip derived from Pexels' *Rainy Highway Drive on Overcast Day*.
`rain_blur_heatmap_12s_640x360_10fps_pexels.mp4` is the matching annotated
motion-occupancy output. The overlay explicitly states that this fallback does
not recognize identities, vehicle classes or licence plates. Source and
license links are recorded in `ATTRIBUTION.md`.

For the clearest fixed-camera presentation, use
`degraded_visibility_fixedcam_12s_640x360_10fps_ccby4.mp4` as the uploaded
input and compare it with
`degraded_visibility_heatmap_12s_640x360_10fps_ccby4.mp4`. The weather
degradation is deliberately synthetic and labelled on every source frame.
