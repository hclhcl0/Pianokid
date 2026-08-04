import json

with open('d:/tk WEB/Piano/piano-backend/public/uploads/json/parsed-1785840832085.json', encoding='utf-8') as f:
    data = json.load(f)

tempo = data['tempo']
left = [n for n in data['notes'] if n['track'] == 'left']
from collections import defaultdict
by_time = defaultdict(list)
for n in left:
    by_time[round(n['startTime'], 2)].append(n)

sorted_times = sorted(by_time.keys())
bass_notes = []
for t in sorted_times:
    grp = sorted(by_time[t], key=lambda n: n['midiNumber'])
    bass_notes.append(grp[0])

beatsPerMeasure = 4
beatsPerMeasureSec = beatsPerMeasure * (60 / tempo)
print(f'Tempo={tempo}, 1 measure = {beatsPerMeasureSec:.3f}s')
print('After stretch (first 8 bass notes):')
for i, n in enumerate(bass_notes[:8]):
    nextStart = bass_notes[i+1]['startTime'] if i+1 < len(bass_notes) else n['startTime'] + beatsPerMeasureSec
    fillDur = max(beatsPerMeasureSec, nextStart - n['startTime'])
    durationBeat = round(fillDur * (tempo / 60), 2)
    cells = round(durationBeat * 4)
    note = n['note']
    t = n['startTime']
    print(f'  {note:4s}  t={t:.2f}s  fillDur={fillDur:.3f}s  durationBeat={durationBeat}  16th-cells={cells}')
