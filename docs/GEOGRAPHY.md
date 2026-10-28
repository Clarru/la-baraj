# La Baraj — Real geography, original settlement

Baseline: 28 October 2026

## Owner's direction

Use Lacul Cinciș's real terrain, roads, shoreline and lake layout. Build and adjust all houses and game structures ourselves. This supersedes the fictional-lake setting of the early La Baraj concept.

## Selected inhabited area

The owner's [area reference](../assets/geography/inhabited-area-reference.png) selects the wider basin and its **southern, road-facing shore** as the main settlement. Cabins follow that road corridor in small clusters, with original docks and social/activity spaces on the same side. Suitable plots may be between road and water or upslope from the road, subject to the actual terrain.

The opposite **north shore is forest only: no cabins or settlement buildings**. Do not distribute the 30 cabin plots evenly around the lake. The whole lake can remain visible as context while playable social space concentrates on the selected south shore.

This is an owner-established art/layout requirement. It is not a factual assertion that real north-shore development does not exist. Exact plot coordinates, terrain grading and walking distances must be checked in the first 3D blockout after elevation import.

## Data layers

| Layer | Source / treatment |
| --- | --- |
| Lake polygon and shoreline | OpenStreetMap geometry; local frozen snapshot |
| Selected road centerlines | OpenStreetMap; import a bounded local extract, excluding buildings |
| Hills/terrain heights | Candidate: Copernicus DEM GLO-30; import and simplify during the terrain step |
| Trees and rocks | Original placement of licensed generic assets |
| Cabins, kiosks, workshops and docks | Original game layout, independent of real houses |
| Gameplay paths, plinths and recovery points | Original separately editable game data |

The initial planning work acquired the real shoreline (643 coordinates) and 93 mapped road/track/path ways. Elevation remains an implementation input to acquire and validate. The preview is a flat geographic outline, not a terrain reconstruction. No houses or other building footprints are in the exported datasets.

## Verified shoreline identity

The one-time OpenStreetMap geocoding result identifies **way 26562627**, named **Lacul Cinciș**, in the Teliucu Inferior / Hunedoara area of Romania. Use [the OSM feature](https://www.openstreetmap.org/way/26562627) to inspect the source.

Its bounding box from that lookup is approximately:

```text
West 22.8211495° E   East 22.8773873° E
South 45.6749016° N  North 45.7019765° N
```

The outline spans roughly 4.4 km east–west and 3.0 km north–south. These are bounding-box extents calculated from coordinates, not a claimed lake area or shoreline length. The real lake is too large to populate uniformly with 30 players, so retain the full outline but focus initial activity in one documented sector.

## Import and conversion

1. Download the water way and referenced nodes once from the OSM API. Record way version, timestamp, retrieval date and source link.
2. Save a GeoJSON FeatureCollection in WGS84 longitude/latitude order. Retain source attribution. Never reinterpret degrees as game meters.
3. Import nearby selected `highway` ways using a bounded extract. Include only appropriate road/path classes. Exclude `building`, address and business/POI data from shipped geographic inputs. Roads are centerlines; their mesh widths are an authored rendering choice.
4. Reproject the production build to local metric coordinates, preferably UTM zone 34N (EPSG:32634). Apply one recorded origin and scale to every geographic layer. Three.js uses +Y up; map north to -Z and east to +X. A simple local approximation is acceptable for a planning preview, not an unrecorded production transform.
5. Obtain elevation independently. GLO-30 is a roughly 30 m digital surface model, not survey-quality bare-earth terrain or underwater bathymetry. Smooth and simplify it, flatten the lake surface, and fix shoreline intersections deliberately. Do not claim it reproduces every bank or lakeside step.
6. Generate low-poly meshes and simplified collision. Store cabins and gameplay objects in a separate scene/layout file so changing them never edits the geographic source.
7. Export optimized local assets. Players load our files from the frontend deployment; there are no geocoding, tile or elevation requests per play session.

The captured road extract used the OSM map API for the rectangle west 22.816, south 45.670, east 22.883, north 45.707. Intersecting ways can include endpoints beyond that rectangle; the preview clips those lines to its view. The Overpass endpoint was unavailable during acquisition, so the bounded OSM map API was used and all non-road features were discarded. Run `scripts/prepare-geography.py` with the two explicitly downloaded OSM JSON files to regenerate the exports; acquisition URLs are recorded in the manifest. The script does not query a live service.

Real road routes remain recognizable. Small gameplay paths and building clearings may be authored separately. Any later global scale change must be uniform across source layers and documented; an arbitrary remixed outline must not be described as the real map.

## Feasibility scene scale revision

The first browser scene used horizontal scale 0.15 (one game meter represented about 6.67 real meters). The owner rejected that scene as too small relative to its houses. The revised scene uses **0.75 horizontal scale**, exactly **5× the original geographic distances and 25× the geographic area**, while keeping cabin and character dimensions independent. Cabin anchors are spread fivefold along the selected southern shore. The shoreline and road transforms change together.

The resulting full-lake bounding width is approximately 3.27 km in game coordinates. The detailed terrain covers the settlement; coarser terrain beyond it is still a visual height proxy. Following the owner playtest, one continuous terrain mesh now supplies rendering and collision throughout the prototype, removing overlapping ground surfaces. These are prototype transforms, not survey-accurate elevation or a promise that the entire lake is finished gameplay space.

## Data use and credits

OpenStreetMap data uses the ODbL. Ship readable “© OpenStreetMap contributors” attribution linked to the copyright page; keep the original/derived geographic dataset separately available with its applicable ODbL notices and share-alike treatment. Original game code and independently authored buildings remain separate works. [OSM copyright](https://www.openstreetmap.org/copyright), [OSMF guidance](https://osmfoundation.org/wiki/Attribution_Guidelines).

Copernicus GLO-30 has its own free license and source/adaptation notices. Save the exact notice with the downloaded product and reproduce the required credit when the dataset is actually used. Its terms are separate from OSM. [Official Copernicus DEM collection and citation information](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).

We need geographic data, not map tiles or a screenshot texture. No Google Maps imagery or 3D building extraction is required for this pipeline. Public OSM services are for bounded acquisition during development, not a runtime backend for players.
