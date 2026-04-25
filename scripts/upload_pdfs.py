#!/usr/bin/env python3
"""
Carga masiva de PDFs a Supabase
================================

* Logistics Info / Notice / Training -> tabla biblioteca_tecnica + bucket biblioteca-tecnica
* INVENTARIOS REPORTE MENSUAL        -> tabla formatos + bucket formatos

Cómo ejecutar (Windows):
  1. Doble click sobre `upload_pdfs.bat` (en esta misma carpeta).
     o bien
  2. Abrir PowerShell aquí y ejecutar:
       py -m pip install supabase --user
       py upload_pdfs.py

El script es idempotente: si vuelve a ejecutarse, no duplica filas.
"""

import os
import re
import sys
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    print("ERROR: falta la librería 'supabase'. Instálala con:")
    print("       py -m pip install supabase --user")
    sys.exit(1)

URL = "https://kzatkwkrghtkzumnjwzn.supabase.co"
SERVICE_ROLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YXRrd2tyZ2h0a3p1bW5qd3puIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjI4OTQ4NCwiZXhwIjoyMDcxODY1NDg0fQ.3L1spVwXSHLevmmHEiNoA5QUQH2emQwY6y05BGVvNo4"

# El script intenta localizar la carpeta automáticamente. Si la ruta
# es distinta en tu PC, edita CANDIDATAS o pasa la ruta como argumento:
#   py upload_pdfs.py "C:\\Users\\Julio\\Desktop\\CLAUDE\\STOREKEEPER APP"
CANDIDATAS = [
    Path(r"C:\Users\Julio\Desktop\CLAUDE\STOREKEEPER APP"),
    Path.home() / "Desktop" / "CLAUDE" / "STOREKEEPER APP",
    Path("/sessions/vibrant-hopeful-davinci/mnt/STOREKEEPER APP"),
]


def localizar_root() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    for c in CANDIDATAS:
        if c.exists():
            return c
    print("ERROR: no encuentro la carpeta STOREKEEPER APP. Pásala como argumento:")
    print('  py upload_pdfs.py "C:\\Users\\Julio\\Desktop\\CLAUDE\\STOREKEEPER APP"')
    sys.exit(2)


ROOT = localizar_root()
print(f"Root detectada: {ROOT}")
sb = create_client(URL, SERVICE_ROLE)

CATEGORIAS = {
    "Logistics Info":     "info",
    "Logistics Notice":   "notice",
    "Logistics Training": "training",
}


def parse_ref_titulo(folder_name: str, _prefix: str):
    """Extrae 'referencia' (LOGINFO_25_01_08, LOGN_22_01...) y 'titulo' del nombre de carpeta."""
    parts = folder_name.split("_")
    ref_parts = [parts[0]]
    consumed = 1
    for p in parts[1:]:
        if re.fullmatch(r"\d{1,4}", p) or re.fullmatch(r"v\d+", p, re.I) or p == "":
            ref_parts.append(p)
            consumed += 1
        else:
            break
    titulo_parts = parts[consumed:]
    referencia = "_".join(ref_parts).strip("_") or folder_name[:40]
    titulo = " ".join(titulo_parts).strip() or folder_name
    return referencia, titulo


def upload_biblioteca():
    inserts = []
    skipped = 0
    for cat_dir, cat_label in CATEGORIAS.items():
        d = ROOT / cat_dir
        if not d.exists():
            print(f"  SKIP carpeta: {d}")
            continue
        for sub in sorted(d.iterdir()):
            if not sub.is_dir():
                continue
            pdfs = list(sub.glob("*.pdf"))
            if not pdfs:
                skipped += 1
                continue
            referencia, titulo_corto = parse_ref_titulo(sub.name, cat_label.upper())
            for pdf in pdfs:
                storage_path = f"{referencia}/v1/{pdf.name}"
                with open(pdf, "rb") as f:
                    data = f.read()
                try:
                    sb.storage.from_("biblioteca-tecnica").upload(
                        path=storage_path,
                        file=data,
                        file_options={"content-type": "application/pdf", "upsert": "true"},
                    )
                except Exception as e:
                    msg = str(e)
                    if "already exists" not in msg.lower() and "Duplicate" not in msg:
                        print(f"  ERR upload {storage_path}: {msg[:200]}")
                        continue
                inserts.append({
                    "titulo": titulo_corto[:200] or sub.name,
                    "referencia": referencia[:80],
                    "categoria": cat_label,
                    "version": 1,
                    "pdf_path": storage_path,
                    "activo": True,
                })

    if inserts:
        existentes = sb.table("biblioteca_tecnica").select("referencia").execute().data or []
        refs_exist = {r["referencia"] for r in existentes}
        # Dedupe por referencia dentro del propio batch (varios PDFs en una misma carpeta -> 1 fila)
        seen = set()
        nuevos = []
        for i in inserts:
            ref = i["referencia"]
            if ref in refs_exist or ref in seen:
                continue
            seen.add(ref)
            nuevos.append(i)
        if nuevos:
            sb.table("biblioteca_tecnica").insert(nuevos).execute()
        print(f"  biblioteca: subidos={len(inserts)} insertados_nuevos={len(nuevos)} "
              f"ya_existentes={len(inserts) - len(nuevos)} skipped_sin_pdf={skipped}")
    else:
        print(f"  biblioteca: sin PDFs nuevos (skipped_sin_pdf={skipped})")


def upload_formatos():
    d = ROOT / "1. INVENTARIOS REPORTE MENSUAL"
    if not d.exists():
        print(f"  SKIP {d}")
        return
    pdfs = sorted(d.glob("*.pdf"))
    inserts = []
    for pdf in pdfs:
        nombre = pdf.stem
        codigo = re.sub(r"\s+", "_", nombre)[:80]
        titulo = nombre.replace("_", " ")
        storage_path = f"{codigo}/{pdf.name}"
        with open(pdf, "rb") as f:
            data = f.read()
        try:
            sb.storage.from_("formatos").upload(
                path=storage_path,
                file=data,
                file_options={"content-type": "application/pdf", "upsert": "true"},
            )
        except Exception as e:
            msg = str(e)
            if "already exists" not in msg.lower() and "Duplicate" not in msg:
                print(f"  ERR upload {storage_path}: {msg[:200]}")
                continue
        inserts.append({
            "titulo": titulo[:200],
            "codigo": codigo,
            "pdf_path": storage_path,
            "pdf_nombre": pdf.name,
            "version": 1,
            "categoria": "inventario",
            "activo": True,
        })

    if inserts:
        existentes = sb.table("formatos").select("codigo").execute().data or []
        cods_exist = {r["codigo"] for r in existentes}
        seen = set()
        nuevos = []
        for i in inserts:
            cod = i["codigo"]
            if cod in cods_exist or cod in seen:
                continue
            seen.add(cod)
            nuevos.append(i)
        if nuevos:
            sb.table("formatos").insert(nuevos).execute()
        print(f"  formatos: subidos={len(inserts)} insertados_nuevos={len(nuevos)} "
              f"ya_existentes={len(inserts) - len(nuevos)}")
    else:
        print("  formatos: sin PDFs encontrados")


def main():
    print("=== BIBLIOTECA ===")
    upload_biblioteca()
    print("=== FORMATOS ===")
    upload_formatos()
    print("Listo.")


if __name__ == "__main__":
    main()
