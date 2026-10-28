#!/usr/bin/env python3
"""Prepare only lake/road geometry from previously downloaded OSM JSON.

No network access. Source files are explicit inputs; building and contributor
records are deliberately excluded from the output. Pillow is used for the
optional planning preview, not by the game or the geographic data conversion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import date
from pathlib import Path

LAKE_WAY_ID = 26562627
ROAD_BBOX = [22.816, 45.670, 22.883, 45.707]
OSM_CREDIT = "© OpenStreetMap contributors"
OSM_LICENSE = "https://opendatacommons.org/licenses/odbl/1.0/"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def node_index(document: dict) -> dict[int, list[float]]:
    return {
        element["id"]: [element["lon"], element["lat"]]
        for element in document["elements"]
        if element["type"] == "node"
    }


def feature(way: dict, coordinates: list, geometry_type: str) -> dict:
    properties = {
        "osm_type": "way",
        "osm_id": way["id"],
        "osm_version": way.get("version"),
        "osm_timestamp": way.get("timestamp"),
        "source_url": f"https://www.openstreetmap.org/way/{way['id']}",
    }
    if geometry_type == "Polygon":
        properties["name"] = way.get("tags", {}).get("name", "Lacul Cinciș")
    else:
        properties["highway"] = way["tags"]["highway"]
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {"type": geometry_type, "coordinates": coordinates},
    }


def collection(features: list[dict]) -> dict:
    return {
        "type": "FeatureCollection",
        "attribution": OSM_CREDIT,
        "license": OSM_LICENSE,
        "retrieved_date": date.today().isoformat(),
        "features": features,
    }


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def preview(output: Path, ring: list[list[float]], roads: list[dict]) -> None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow unavailable; geographic data prepared without PNG preview.")
        return

    width, height = 1600, 1080
    image = Image.new("RGB", (width, height), "#14221f")
    draw = ImageDraw.Draw(image)
    font_path = Path("/System/Library/Fonts/Supplemental/Arial.ttf")

    def font(size: int):
        return ImageFont.truetype(str(font_path), size) if font_path.exists() else ImageFont.load_default()

    lon0 = (ROAD_BBOX[0] + ROAD_BBOX[2]) / 2
    lat0 = (ROAD_BBOX[1] + ROAD_BBOX[3]) / 2
    # Equirectangular local metric approximation for this small planning image.
    # Production terrain must use the recorded metric projection in GEOGRAPHY.md.
    def meters(coord: list[float]) -> tuple[float, float]:
        return (
            math.radians(coord[0] - lon0) * 6371008.8 * math.cos(math.radians(lat0)),
            math.radians(coord[1] - lat0) * 6371008.8,
        )

    west, south = meters(ROAD_BBOX[:2])
    east, north = meters(ROAD_BBOX[2:])
    area = (75, 190, 1525, 905)
    scale = min((area[2] - area[0]) / (east - west), (area[3] - area[1]) / (north - south))
    cx, cy = (area[0] + area[2]) / 2, (area[1] + area[3]) / 2

    def pixel(coord: list[float]) -> tuple[float, float]:
        x, y = meters(coord)
        return cx + x * scale, cy - y * scale

    # Render source-derived road lines to their own layer so the geographic
    # acquisition bounds can be applied without drawing roads over the labels.
    road_layer = Image.new("RGBA", image.size)
    road_draw = ImageDraw.Draw(road_layer)
    for road in roads:
        points = [pixel(point) for point in road["geometry"]["coordinates"]]
        road_class = road["properties"]["highway"]
        substantial = road_class not in {"path", "track", "footway", "steps", "cycleway", "bridleway"}
        road_draw.line(points, fill="#b2a991" if substantial else "#53675b", width=3 if substantial else 2)
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).rectangle(area, fill=255)
    image.paste(road_layer.convert("RGB"), mask=Image.composite(road_layer.getchannel("A"), Image.new("L", image.size), mask))
    draw = ImageDraw.Draw(image)
    lake_points = [pixel(point) for point in ring]
    draw.polygon(lake_points, fill="#397e89")
    draw.line(lake_points, fill="#98d2cd", width=3)

    draw.text((75, 48), "Lake Cinciș", font=font(48), fill="#f3eee0")
    draw.text((77, 112), "REAL SHORELINE + MAPPED ROADS · PLANNING BASE", font=font(20), fill="#a7bab1")
    draw.text((77, 148), "Buildings excluded. Cabin locations, terrain heights and game layout are not shown.", font=font(18), fill="#a7bab1")
    draw.line((1470, 285, 1470, 215), fill="#f3eee0", width=3)
    draw.polygon([(1470, 205), (1462, 222), (1478, 222)], fill="#f3eee0")
    draw.text((1462, 181), "N", font=font(18), fill="#f3eee0")

    bar_width = 1000 * scale
    draw.line((95, 870, 95 + bar_width, 870), fill="#f3eee0", width=4)
    draw.text((95, 838), "1 km (approx.)", font=font(17), fill="#f3eee0")
    draw.rectangle((75, 945, 95, 960), fill="#397e89")
    draw.text((108, 940), "Lake", font=font(18), fill="#f3eee0")
    draw.line((230, 953, 265, 953), fill="#b2a991", width=3)
    draw.text((278, 940), "Roads / tracks / paths", font=font(18), fill="#f3eee0")
    draw.text((75, 986), "© OpenStreetMap contributors · ODbL · openstreetmap.org/copyright", font=font(18), fill="#a7bab1")
    draw.text((75, 1018), "North-up local projection preview. This is geographic source data, not the finished game map.", font=font(17), fill="#a7bab1")
    image.save(output / "lake-cincis-map-preview.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lake-source", required=True, type=Path)
    parser.add_argument("--area-source", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("assets/geography"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    lake_document, area_document = load(args.lake_source), load(args.area_source)
    lake_nodes, area_nodes = node_index(lake_document), node_index(area_document)
    lake_way = next(e for e in lake_document["elements"] if e["type"] == "way" and e["id"] == LAKE_WAY_ID)
    ring = [lake_nodes[node_id] for node_id in lake_way["nodes"]]
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError("Source lake way is not a valid closed ring")

    roads = []
    for way in area_document["elements"]:
        tags = way.get("tags", {})
        if way["type"] != "way" or "highway" not in tags or "building" in tags:
            continue
        if tags["highway"] in {"proposed", "construction"}:
            continue
        coordinates = [area_nodes[node_id] for node_id in way["nodes"]]
        if len(coordinates) >= 2:
            roads.append(feature(way, coordinates, "LineString"))

    lake_feature = feature(lake_way, [ring], "Polygon")
    write_json(args.output / "lake-cincis-shoreline.geojson", collection([lake_feature]))
    write_json(args.output / "lake-cincis-roads.geojson", collection(roads))
    manifest = {
        "retrieved_date": date.today().isoformat(),
        "lake_way_id": LAKE_WAY_ID,
        "lake_way_version": lake_way.get("version"),
        "lake_way_timestamp": lake_way.get("timestamp"),
        "lake_source_url": f"https://api.openstreetmap.org/api/0.6/way/{LAKE_WAY_ID}/full.json",
        "road_source_url": "https://api.openstreetmap.org/api/0.6/map.json?bbox=" + ",".join(map(str, ROAD_BBOX)),
        "road_acquisition_bbox_wsen": ROAD_BBOX,
        "shoreline_coordinate_count": len(ring),
        "road_way_count": len(roads),
        "excluded": ["buildings", "addresses", "businesses", "contributor account metadata"],
        "not_acquired": ["terrain elevation", "underwater bathymetry"],
        "coordinate_reference_system": "WGS84 longitude, latitude (GeoJSON)",
        "attribution": OSM_CREDIT,
        "license": OSM_LICENSE,
        "files": {},
    }
    for name in ["lake-cincis-shoreline.geojson", "lake-cincis-roads.geojson"]:
        manifest["files"][name] = {"sha256": hashlib.sha256((args.output / name).read_bytes()).hexdigest()}
    write_json(args.output / "source-manifest.json", manifest)
    preview(args.output, ring, roads)
    print(json.dumps({"lake_points": len(ring), "road_ways": len(roads), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
