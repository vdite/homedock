# HomeDock

HomeDock ist eine kleine, selbst gehostete Startseite für App-Shortcuts. Links lassen sich in Gruppen ordnen, durchsuchen und per Drag-and-drop verschieben. Mehr macht die App bewusst nicht.

## Start mit Docker Compose

```bash
docker compose up -d
```

Danach ist HomeDock unter [http://localhost:8080](http://localhost:8080) erreichbar.

Die Konfiguration wird im Docker-Volume `homedock-data` gespeichert und bleibt bei Container-Updates erhalten.

Das Image `ghcr.io/vdite/homedock` wird bei jedem Push auf `main` per GitHub Actions für `amd64` und `arm64` gebaut. Update:

```bash
docker compose pull && docker compose up -d
```

## Portainer

**Stacks → Add stack → Web editor**, den Inhalt von `compose.yaml` einfügen und deployen. Für Updates im Stack **Update the stack** mit aktiviertem **Re-pull image** ausführen.

## Selbst bauen

```bash
docker build -t ghcr.io/vdite/homedock:latest .
docker compose up -d
```

## Bedienung

- Über **Neue Gruppe** Themen wie „Arbeit“, „Smart Home“ oder „Medien“ anlegen.
- Über **App hinzufügen** Name und URL eines Shortcuts eintragen.
- **Ordnen** aktiviert Bearbeiten, Löschen und Drag-and-drop.
- `/` fokussiert die Suche.
- Das Drei-Punkte-Menü exportiert oder importiert die komplette Konfiguration als JSON.

Ohne eigenes Icon versucht HomeDock, `/favicon.ico` der verlinkten Website zu laden. Alternativ kann ein Emoji oder eine direkte `http(s)`-Bild-URL eingetragen werden.

## Konfiguration

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `8080` | HTTP-Port im Container |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATA_DIR` | `/data` | Verzeichnis für persistente Daten |
| `CONFIG_FILE` | `/data/dashboard.json` | Optionaler vollständiger Pfad zur JSON-Datei |

Einen anderen Host-Port setzt du in `compose.yaml`, zum Beispiel `"3000:8080"`.

## Backup

Am einfachsten ist der Export im Drei-Punkte-Menü. Für ein direktes Backup des Docker-Volumes:

```bash
docker run --rm \
  -v homedock_homedock-data:/data:ro \
  -v "$PWD":/backup \
  alpine cp /data/dashboard.json /backup/homedock-backup.json
```

Der tatsächliche Volume-Name kann je nach Compose-Projektname abweichen (`docker volume ls`).

## Lokale Entwicklung

Voraussetzung ist Node.js 22 oder neuer. Es gibt keine externen Laufzeitabhängigkeiten.

```bash
npm start
npm test
```

Lokal landet die Konfiguration standardmäßig unter `./data/dashboard.json`.

## Sicherheitsmodell

HomeDock hat absichtlich keine Benutzerverwaltung. Betreibe es nur in einem vertrauenswürdigen Heimnetz oder setze für öffentlichen Zugriff einen Reverse Proxy mit Authentifizierung davor. Die Zielseiten werden vom Server nicht abgerufen; lediglich der Browser versucht deren Favicons zu laden.
