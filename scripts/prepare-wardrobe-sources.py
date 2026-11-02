"""Resolve two publisher filename typos without changing the downloaded ZIPs."""
from pathlib import Path
import hashlib
import json
import shutil
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "assets/source-models/wardrobe"
fixes = []
for name in ["T_Eye_Normal", "T_Hair_1_Normal"]:
    folder = next((RAW / "base/extracted").glob("*/Base Characters/Godot - UE"))
    original, alias = folder / f"{name}.png", folder / f"{name}_png.png"
    if not original.is_file():
        raise RuntimeError(f"Missing publisher texture {original.name}")
    if alias.exists() and alias.read_bytes() != original.read_bytes():
        raise RuntimeError("Refusing to overwrite a different source texture")
    shutil.copy2(original, alias)
    fixes.append({"original": str(original.relative_to(ROOT)),
                  "alias": str(alias.relative_to(ROOT)),
                  "sha256": hashlib.sha256(original.read_bytes()).hexdigest()})
checked = 0
for folder in [RAW / "base/extracted", RAW / "outfits/extracted"]:
    for source in folder.rglob("*.gltf"):
        data = json.loads(source.read_text())
        for kind in ["buffers", "images"]:
            for item in data.get(kind, []):
                uri = item.get("uri", "")
                if uri and not uri.startswith("data:"):
                    path = (source.parent / unquote(uri)).resolve()
                    if not path.is_relative_to(folder.resolve()) or not path.is_file():
                        raise RuntimeError(f"Unresolved {kind} reference in {source.name}: {uri}")
        checked += 1
record = {"reason": "Publisher glTF names two existing normal maps with an extra _png suffix",
          "fixes": fixes, "validatedGLTFs": checked,
          "geometryOrOriginalArchivesModified": False}
(ROOT / "assets/wardrobe-source/preparation.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record, indent=2))
