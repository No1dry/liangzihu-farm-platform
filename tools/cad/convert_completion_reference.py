#!/usr/bin/env python3
"""Convert verified CAD completion candidates from EPSG:4547 GeoPackage to EPSG:4326 GeoJSON.

Usage:
  python tools/cad/convert_completion_reference.py \
    /path/to/梁子湖竣工图候选几何_EPSG4547_测试.gpkg \
    data/cad-reference/completion-reference.json
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd

CATEGORY_LABELS = {
    "land": "土地平整范围",
    "road": "生产道路",
    "canal": "农渠与排水沟",
}
EXPECTED_BOUNDS = (114.55, 30.20, 114.70, 30.32)


def clean_issues(frame):
    return frame["issues"].fillna("").astype(str).str.strip().eq("")


def read_layer(path: Path, name: str):
    return gpd.read_file(path, layer=name)


def selected_frames(polygons, lines):
    land = polygons[(polygons["class"] == "土地平整施工范围") & clean_issues(polygons)]
    road = [
        ("line", lines[(lines["class"] == "道路") & clean_issues(lines)]),
        ("polygon", polygons[(polygons["class"] == "道路") & clean_issues(polygons)]),
    ]
    canal = [
        ("line", lines[(lines["class"] == "沟渠") & clean_issues(lines)]),
        ("polygon", polygons[(polygons["class"] == "沟渠") & clean_issues(polygons)]),
    ]
    return {"land": [("polygon", land)], "road": road, "canal": canal}


def feature_from_row(category: str, geometry_kind: str, row):
    geom = row.geometry
    if geom is None or geom.is_empty:
        raise ValueError(f"空几何：{row.record_id}")
    if geometry_kind == "polygon":
        measure_type, measure_value, measure_unit = "area", float(geom.area), "平方米"
    else:
        measure_type, measure_value, measure_unit = "length", float(geom.length), "米"
    return {
        "type": "Feature",
        "id": str(row.record_id),
        "geometry": json.loads(gpd.GeoSeries([geom], crs="EPSG:4547").to_crs(4326).to_json())["features"][0]["geometry"],
        "properties": {
            "category": category,
            "category_label": CATEGORY_LABELS[category],
            "cad_file": str(row.cad_file),
            "layer_name": str(row.layer_name),
            "handle": str(row.handle),
            "source_class": str(row["class"]),
            "confidence": str(row.confidence),
            "crs_status": str(row.crs_status),
            "measure_type": measure_type,
            "measure_value": round(measure_value, 2),
            "measure_unit": measure_unit,
            "source_notice": "来源于竣工图，尚未核实为正式农业资产",
        },
    }


def grouped_counts(frame, label: str):
    counts = {}
    if frame.empty:
        return counts
    for (class_name, issues), count in frame.groupby([frame["class"].fillna("未分类"), frame["issues"].fillna("")]).size().items():
        key = str(class_name) if not str(issues) else f"{class_name}（{issues}）"
        counts[key] = int(count)
    return {label: counts}


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    source = Path(sys.argv[1]).expanduser().resolve()
    output = Path(sys.argv[2]).expanduser().resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    polygons = read_layer(source, "候选面")
    lines = read_layer(source, "候选线")
    abnormal = read_layer(source, "隔离_异常几何_候选面")
    points = read_layer(source, "隔离_设施未确认_插入点候选")
    selections = selected_frames(polygons, lines)

    features = []
    selected_ids = set()
    for category, groups in selections.items():
        for geometry_kind, frame in groups:
            for _, row in frame.iterrows():
                selected_ids.add(str(row.record_id))
                features.append(feature_from_row(category, geometry_kind, row))

    if len(features) != len(selected_ids):
        raise ValueError("record_id 存在重复，已停止导出")
    collection = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
    minx, miny, maxx, maxy = collection.total_bounds
    expected_minx, expected_miny, expected_maxx, expected_maxy = EXPECTED_BOUNDS
    if not (expected_minx <= minx and maxx <= expected_maxx and expected_miny <= miny and maxy <= expected_maxy):
        raise ValueError(f"转换后范围不在沙湾村预期范围内：{collection.total_bounds.tolist()}")

    selected_poly_ids = {str(row.record_id) for _, frame in selections["land"] for _, row in frame.iterrows()}
    for _, frame in selections["road"] + selections["canal"]:
        if frame.geom_type.iloc[0] == "Polygon":
            selected_poly_ids.update(str(row.record_id) for _, row in frame.iterrows())
    excluded_polygons = polygons[~polygons["record_id"].astype(str).isin(selected_poly_ids)]
    excluded_lines = lines[~lines["record_id"].astype(str).isin(selected_ids)]

    stats = {
        "input": {
            "candidate_polygons": int(len(polygons)),
            "candidate_lines": int(len(lines)),
            "abnormal_polygons": int(len(abnormal)),
            "unverified_facility_points": int(len(points)),
        },
        "selected": {
            "land_levelling": int(sum(len(frame) for _, frame in selections["land"])),
            "production_roads": int(sum(len(frame) for _, frame in selections["road"])),
            "canals_and_drains": int(sum(len(frame) for _, frame in selections["canal"])),
        },
        "excluded": {
            "candidate_polygons": int(len(excluded_polygons)),
            "candidate_lines": int(len(excluded_lines)),
            "abnormal_polygons": int(len(abnormal)),
            "unverified_facility_points": int(len(points)),
        },
        "excluded_reasons": {
            **grouped_counts(excluded_polygons, "candidate_polygons"),
            **grouped_counts(excluded_lines, "candidate_lines"),
            "abnormal_polygons": {"面自相交或无效": int(len(abnormal))},
            "unverified_facility_points": {"设施插入点尚未核实": int(len(points))},
        },
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "梁子湖沙湾村竣工图参考图层",
            "source_file": source.name,
            "source_crs": "EPSG:4547",
            "target_crs": "EPSG:4326",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "bounds_4326": [round(float(value), 8) for value in collection.total_bounds],
            "statistics": stats,
        },
        "features": features,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"Wrote {len(features)} features to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
