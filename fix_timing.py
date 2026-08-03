import json

path = 'piano-backend/public/uploads/json/999-doa-hong.json'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

notes = data['notes']
min_t = min(n['startTime'] for n in notes)
print(f'Shifting by -{min_t:.3f}s  ({len(notes)} notes)')

for n in notes:
    n['startTime'] = round(n['startTime'] - min_t, 4)

data['duration'] = round(data['duration'] - min_t, 4)

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)

new_min = min(n['startTime'] for n in notes)
new_max = max(n['startTime'] for n in notes)
print(f'OK  startTime: {new_min:.3f}s - {new_max:.3f}s   duration: {data["duration"]}s')

sorted_notes = sorted(notes, key=lambda x: x['startTime'])
for n in sorted_notes[:5]:
    print(f"  {n['note']:<4} t={n['startTime']:.3f}s  track={n['track']}")
