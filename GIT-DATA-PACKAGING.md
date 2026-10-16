# Git data packaging — 14 September 2026

The private repository contains the completed HCMC application, shared core, operational cropped rasters/GLBs, retained photographs/material maps, source metadata/receipts and tests. The Gia Lộc/Tây Ninh working datasets (`outputs/tayninh-*`, `outputs/review-gia-loc`) and the Gia Lộc project contract `outputs/shared/digital-twin-core/projects/gia-loc.json` were removed in CLEANUP C; their history remains in `git log`. Keep the `outputs/hcmc-poc/` and `outputs/shared/digital-twin-core/` relative directory layout when serving HCMC.

Run `python3 outputs/hcmc-poc/serve.py` from the repository root, then open `/hcmc-poc/?v=18b&view=overview`. The server requires port 8768 and HTTP Range for surface18. The historical standalone HTML/ZIP delivery bundles are not the current runtime.

## Provider archives kept outside regular Git

The `.gitignore` excludes the large full-tile Sentinel TCI, WorldCover, ETH canopy/JRC rasters and full Microsoft provider partition used in earlier Gia Lộc processing. It also excludes byte-range download buffers, unused original PBR ZIPs and one oversized copy of the publicly accessible 3D Tiles specification. These files remain on the original workstation; they were not deleted. The cropped/derived operational assets, native source windows, JSON acquisition receipts, source URLs/rights/epochs and relevant QA remain in Git.

The 49 MB Copernicus tile in `outputs/tayninh-data-batch-01/raw/global/` is retained as a raw Tây Ninh context tile; after CLEANUP C no project contract registers it, so it is a candidate for removal in a later pass. The four HCMC surface18 COGs and all catalog-referenced GLBs/feature sidecars are retained, as are the shared core's remaining registered assets. Archive-exclusion patterns must not be broadened to all TIFFs or all `raw/` directories.

Regular GitHub Git blocks individual files above 100 MiB. This repository does not introduce Git LFS or a new external storage service. [GitHub file-size documentation](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

## Reprocessing versus running the demo

A clean clone contains runtime crops and can run the existing applications. Reprocessing an earlier *full-provider-tile* experiment may require downloading the excluded source archive again or copying it from the acquisition workstation to the exact original path. Follow the pinned URLs, source records and scripts under the relevant batch's `sources/`, `scripts/` and `derived/`; access and dataset versions can change. Do not substitute a latest provider tile and claim it matches a historical fingerprint.

HCMC surface18 has retained native windows for offline rebuilding. Its pipeline/runbook and release checks are in [Batch18 architecture](research/vibecode-18/ARCHITECTURE-AND-SOURCES.md) and [demo18 guide](outputs/DEMO-18-HUONG-DAN.md). Check the frozen release with:

```sh
python3 research/vibecode-18/qa/verify-release.py
```

The release fingerprint scope is explicit: it is not a checksum of every excluded global provider archive or all historical packages. Download-buffer receipts preserve acquisition evidence but do not make their excluded response bodies present in a clean clone. Dataset-specific reproducibility checks that expect excluded full-tile originals require the separate archives.
