$(python - <<'PY'
import urllib.request
url='https://raw.githubusercontent.com/pfigueroa78/english-os-dashboard/main/src/app/api/english-os/coach/route.ts'
print(urllib.request.urlopen(url).read().decode())
PY)