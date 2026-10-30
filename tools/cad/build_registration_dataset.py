#!/usr/bin/env python3
"""Build the CAD→formal-object registration dataset (fields/ponds/facilities) in EPSG:4326.

Inputs:
  1. data/cad-reference/completion-reference.json  (verified land polygons, already 4326)
  2. 梁子湖竣工图候选几何_EPSG4547_测试.gpkg        (pond polygons, layer 候选面)
  3. 设施图块与插入位置待核实.csv                    (gate/pump/storage insertion points)

Output: data/cad-reference/registration-dataset.json
All items are draft-status registration candidates; culverts (涵管/过路涵) are excluded per product decision.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import geopandas as gpd
from pyproj import Transformer

REPO = Path(__file__).resolve().parents[2]
CAD_GEO = REPO.parent / ".cad-geo" / "定位验证成果"
MAIN_GPKG = CAD_GEO / "GIS测试数据" / "梁子湖竣工图候选几何_EPSG4547_测试.gpkg"
FACILITY_CSV = CAD_GEO / "既有成果复核" / "梁子湖竣工图提取成果" / "09-提取的空间数据" / "设施图块与插入位置待核实.csv"
REFERENCE_JSON = REPO / "data" / "cad-reference" / "completion-reference.json"
OUT = REPO / "data" / "cad-reference" / "registration-dataset.json"

VILLAGES = {
    "2026.4.16竣工图（庙下流）.dxf": {"code": "MXL", "name": "庙下流"},
    "2026.4.16竣工图（新屋湾、毛家湾）.dxf": {"code": "XWM", "name": "新屋湾毛家湾"},
    "2026.8.10竣工图（张家湾）.dxf": {"code": "ZJW", "name": "张家湾"},
    "2026.8.10竣工图（谭湾沈湾）.dxf": {"code": "TSW", "name": "谭湾沈湾"},
    "ABCDEFD区竣工图.dxf": {"code": "ABCD", "name": "ABCDEFD区"},
}
FACILITY_TYPES = {
    "6-2水闸": ("水闸", "SZ"),
    "2-5泵站": ("泵站", "BZ"),
    "2-5 泵站": ("泵站", "BZ"),
    "2-5泵站标注层": ("泵站", "BZ"),
    "4-0蓄水池": ("蓄水池", "XSC"),
}
transformer = Transformer.from_crs("EPSG:4547", "EPSG:4326", always_xy=True)


def main() -> int:
    items: list[dict] = []

    ref = json.loads(REFERENCE_JSON.read_text(encoding="utf-8"))
    for feature in ref["features"]:
        p = feature["properties"]
        if p["category"] != "land":
            continue
        items.append({
            "kind": "field", "type_label": "农田", "drawing": p["cad_file"],
            "handle": p["handle"], "geometry": feature["geometry"],
            "source_note": f"CAD 竣工图土地平整范围（{p['cad_file']} 图层 {p['layer_name']}），面积 {p['measure_value']:.2f} ㎡，待现场核实",
        })

    ponds = gpd.read_file(MAIN_GPKG, layer="候选面")
    ponds = ponds[ponds["class"] == "塘口清淤施工范围"].to_crs("EPSG:4326")
    for _, row in ponds.iterrows():
        items.append({
            "kind": "pond", "type_label": "塘口", "drawing": row["cad_file"],
            "handle": row["handle"], "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"],
            "source_note": f"CAD 竣工图塘口清淤施工范围（{row['cad_file']}），面积 {row['area_raw']:.2f} ㎡，待现场核实",
        })

    with FACILITY_CSV.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            layer = row["源图层"]
            if layer not in FACILITY_TYPES:
                continue
            type_label, prefix = FACILITY_TYPES[layer]
            raw_x, raw_y = float(row["插入X原值"]), float(row["插入Y原值"])
            # 闸/泵/蓄水池插入点与整图 EPSG:4547 坐标系不一致（整图 bbox 约 559000–561000，
            # 这些点 X≈-3.8e7，疑似详图插图坐标），定位验证已将其列为离群未核实。
            # 不编造坐标：登记为无几何的待核实对象，待现场核实后补位置。
            usable = 500000 < raw_x < 620000 and 3300000 < raw_y < 3400000
            geometry = None
            if usable:
                lon, lat = transformer.transform(raw_x, raw_y)
                geometry = {"type": "Point", "coordinates": [round(lon, 8), round(lat, 8)]}
            items.append({
                "kind": "facility", "type_label": type_label, "type_prefix": prefix,
                "drawing": row["来源图纸"], "handle": row["源HANDLE"],
                "geometry": geometry,
                "source_note": f"CAD 竣工图设施插入点（{row['来源图纸']} 图层 {layer}），仅图块符号位置"
                + ("" if usable else "；原始插入坐标与整图坐标系不一致，暂未登记位置，待现场核实后补"),
            })

    counters: dict[tuple[str, str], int] = {}
    for item in items:
        village = VILLAGES[item["drawing"]]
        type_prefix = {"field": "T", "pond": "TG"}.get(item["kind"]) or item["type_prefix"]
        key = (village["code"], type_prefix)
        counters[key] = counters.get(key, 0) + 1
        seq = counters[key]
        item["village"] = village["name"]
        item["code"] = f"CAD-{village['code']}-{type_prefix}{seq:02d}"
        item["name"] = f"{village['name']}{item['type_label']}{seq:02d}"
        item.pop("type_prefix", None)

    dataset = {
        "villages": [{"code": v["code"], "name": v["name"], "drawing": k} for k, v in VILLAGES.items()],
        "items": items,
        "summary": {
            "fields": sum(1 for i in items if i["kind"] == "field"),
            "ponds": sum(1 for i in items if i["kind"] == "pond"),
            "facilities": sum(1 for i in items if i["kind"] == "facility"),
        },
    }
    OUT.write_text(json.dumps(dataset, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(dataset["summary"], ensure_ascii=False), "->", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
