"""Retain the publisher's free Standard character sources, never paid editions."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from html import unescape
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
PACKS = {
    "base": "universal-base-characters",
    "outfits": "modular-character-outfits-fantasy",
}


def acquire(name: str) -> None:
    slug = PACKS[name]
    source = f"https://quaternius.itch.io/{slug}"
    directory = ROOT / "assets/source-models/wardrobe" / name
    directory.mkdir(parents=True, exist_ok=True)
    cookie = directory / "cookies.txt"
    archive = directory / "standard.zip"

    def request(url: str, data: str | None = None) -> str:
        command = ["curl", "--fail", "--silent", "--show-error", "--location",
                   "--cookie", str(cookie), "--cookie-jar", str(cookie)]
        if data is not None:
            command += ["--data-urlencode", f"csrf_token={data}"]
        return subprocess.check_output(command + [url], text=True)

    if not archive.exists():
        purchase = request(source + "/purchase")
        token = re.search(r'<meta name="csrf_token" value="([^"]+)"', purchase)
        if not token:
            raise RuntimeError("Publisher did not provide its public download token")
        result = json.loads(request(source + "/download_url", unescape(token[1])))
        download = request(result["url"])
        (directory / "download-page.html").write_text(download)
        token = re.search(r'<meta name="csrf_token" value="([^"]+)"', download)
        uploads = re.findall(
            r'data-upload_id="(\d+)".*?<strong\b[^>]*class="name"[^>]*>(.*?)</strong>',
            download, re.S,
        )
        standard = [(key, unescape(label)) for key, label in uploads
                    if "[Standard].zip" in label]
        if len(standard) != 1 or not token:
            raise RuntimeError(f"Expected exactly one free Standard ZIP; found {uploads}")
        file_id, label = standard[0]
        result = json.loads(request(source + f"/file/{file_id}?source=game_download",
                                    unescape(token[1])))
        if not result.get("url"):
            raise RuntimeError("Publisher did not return a Standard download")
        temporary = archive.with_suffix(".part")
        subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location",
                        "--output", str(temporary), result["url"]], check=True)
        with zipfile.ZipFile(temporary) as downloaded:
            if downloaded.testzip() is not None:
                raise RuntimeError("Downloaded ZIP failed CRC verification")
        temporary.rename(archive)
    retained = []
    with zipfile.ZipFile(archive) as downloaded:
        for item in downloaded.infolist():
            relative = PurePosixPath(item.filename)
            if relative.is_absolute() or ".." in relative.parts:
                raise RuntimeError("Unsafe source archive path")
            if item.is_dir() or relative.suffix.lower() not in {
                ".gltf", ".glb", ".bin", ".png", ".jpg", ".txt", ".md",
            }:
                continue
            target = directory / "extracted" / Path(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            content = downloaded.read(item)
            target.write_bytes(content)
            retained.append({"path": str(target.relative_to(directory)),
                             "bytes": len(content),
                             "sha256": hashlib.sha256(content).hexdigest()})
    record = {"publisher": "Quaternius", "page": source, "edition": "Standard",
              "archiveBytes": archive.stat().st_size,
              "archiveSHA256": hashlib.sha256(archive.read_bytes()).hexdigest(),
              "files": retained}
    destination = ROOT / "assets/wardrobe-source"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / f"{name}-source-manifest.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps({key: value for key, value in record.items() if key != "files"}
                     | {"retainedFiles": len(retained)}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack", choices=PACKS)
    acquire(parser.parse_args().pack)
