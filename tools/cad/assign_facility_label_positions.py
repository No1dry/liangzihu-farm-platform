#!/usr/bin/env python3
"""Assign facility positions from CAD label texts (图面标注文字) to registered facility objects.

Block insertion points for gates/pumps/storages are in an inconsistent coordinate space
(定位验证离群), but label texts carry valid EPSG:4547 positions. Labels sit beside the
facility (文字+引线), so positions are approximate and recorded as such.

Matching: within the same drawing and facility type, pair objects (handle order) with
labels (east→north order); objects without a label stay unpositioned.

Output: data/cad-reference/facility-label-positions.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pyproj import Transformer

REPO = Path(__file__).resolve().parents[2]
TEXT_DIR = REPO.parent / ".cad-geo" / "定位验证成果" / "既有成果复核" / "梁子湖竣工图提取成果" / "09-提取的空间数据"
DATASET = REPO / "data" / "cad-reference" / "registration-dataset.json"
OUT = REPO / "data" / "cad-reference" / "facility-label-positions.json"

DRAWING_TEXT = {
    "2026.4.16竣工图（庙下流）.dxf": "2026.4.16竣工图（庙下流）_文字.json",
    "2026.4.16竣工图（新屋湾、毛家湾）.dxf": "2026.4.16竣工图（新屋湾、毛家湾）_文字.json",
    "2026.8.10竣工图（张家湾）.dxf": "2026.8.10竣工图（张家湾）_文字.json",
    "2026.8.10竣工图（谭湾沈湾）.dxf": "2026.8.10竣工图（谭湾沈湾）_文字.json",
    "ABCDEFD区竣工图.dxf": "ABCDEFD区竣工图_文字.json",
}
LABEL_RULES = {
    "水闸": re.compile(r"智能闸|水闸"),
    "泵站": re.compile(r"泵站|泵房"),
    "蓄水池": re.compile(r"出水池|沉沙池|蓄水池"),
}
transformer = Transformer.from_crs("EPSG:4547", "EPSG:4326", always_xy=True)


def parse_pos(raw: str) -> tuple[float, float]:
    x, y, *_ = raw.strip().strip("()").split(",")
    return float(x), float(y)


def main() -> int:
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    facilities = [i for i in dataset["items"] if i["kind"] == "facility"]
    by_key: dict[tuple[str, str], list[dict]] = {}
    for item in facilities:
        by_key.setdefault((item["drawing"], item["type_label"]), []).append(item)

    labels_by_key: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for drawing, filename in DRAWING_TEXT.items():
        path = TEXT_DIR / filename
        if not path.exists():
            continue
        for entry in json.loads(path.read_text(encoding="utf-8")):
            text = str(entry.get("text", ""))
            for type_label, pattern in LABEL_RULES.items():
                if pattern.search(text) and entry.get("pos"):
                    x, y = parse_pos(entry["pos"])
                    if 500000 < x < 620000 and 3300000 < y < 3400000:
                        labels_by_key.setdefault((drawing, type_label), []).append((x, y))

    positions: list[dict] = []
    unmatched: list[str] = []
    for (drawing, type_label), items in sorted(by_key.items()):
        labels = sorted(labels_by_key.get((drawing, type_label), []), key=lambda p: (p[0], p[1]))
        for seq, item in enumerate(sorted(items, key=lambda i: i["handle"])):
            if seq < len(labels):
                lon, lat = transformer.transform(*labels[seq])
                positions.append({
                    "code": item["code"], "name": item["name"], "type_label": type_label,
                    "geometry": {"type": "Point", "coordinates": [round(lon, 8), round(lat, 8)]},
                    "source_note": f"位置取自 CAD 图面标注文字（{drawing}），为设施旁标注位置而非本体插入点，待现场核实",
                })
            else:
                unmatched.append(item["code"])

    OUT.write_text(json.dumps({"positions": positions, "unmatched": unmatched}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"已匹配 {len(positions)} 处，未匹配 {len(unmatched)} 处 -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
