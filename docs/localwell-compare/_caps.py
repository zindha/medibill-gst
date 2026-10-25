import re, pathlib
BASE = pathlib.Path(r"D:\Projects\MediBillGST\docs\localwell-compare")
PARTS = [BASE / "_refparts" / f"part-{p}.md" for p in ["1", "2", "3", "4", "5a"]]
out = []
for f in PARTS:
    text = f.read_text(encoding="utf-8")
    text = re.sub(r"^# Reference part .*\n+", "", text, flags=re.M)
    for b in re.split(r"\n(?=### )", text):
        b = b.strip()
        if not b.startswith("### "):
            continue
        head, _, rest = b.partition("\n")
        m = re.match(r"###\s+(\S+)\s+·", head.strip())
        route = m.group(1)
        feats, cur = [], None
        for line in rest.splitlines():
            s = line.strip()
            if s.startswith("Features:"):
                cur = "f"; continue
            if s.startswith("Interactions:"):
                cur = None; continue
            if re.match(r"^(API|Entities|Notes):", s):
                cur = None; continue
            if cur == "f" and s.startswith("- "):
                t = s[2:].strip()
                t = re.split(r"(?<=[a-z0-9\)\"]): ", t)[0]
                feats.append(t[:115])
        out.append(f"### {route}\n" + "\n".join("- " + x for x in feats))
(BASE / "_refparts" / "_caps.md").write_text("\n\n".join(out) + "\n", encoding="utf-8")
print("ok", len(out))
