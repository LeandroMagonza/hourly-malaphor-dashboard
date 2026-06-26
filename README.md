# Hourly Malaphor — Dashboard

Dashboard estático (GitHub Pages) para revisar la **cola** del bot
[hourly-malaphor](https://github.com/LeandroMagonza/hourly-malaphor) (repo privado).

No tiene backend: lee y escribe la cola directamente con la **GitHub API**, usando
un **token tuyo** que pegás en la pantalla y queda guardado solo en tu navegador
(`localStorage`, nunca se sube a ningún lado).

## Qué podés hacer

Por cada entrada de la cola (cada una con sus candidatos y el pick del juez):

- **Dejar la del juez** → tocá *Guardar* sin cambiar nada.
- **Elegir otra opción** → seleccioná otro candidato y *Guardar*.
- **Escribir la tuya** → tipeá en el campo de la opción propia y *Guardar*.
- **Borrar la entrada** → *Borrar*.
- **Tuitear ya** → *Enviar ahora* (guarda tu selección y dispara el workflow `send`
  de Actions para esa entrada; el dashboard no postea directo porque no tiene las
  credenciales de Twitter). Requiere que el token tenga también **Actions: Read and write**.

El bot, a la hora en punto, tuitea la **primera** entrada de la cola con su opción
seleccionada (la del juez si no la tocaste, o la tuya). *Guardar* marca la entrada
como **revisada**.

## Token

Necesitás un **fine-grained Personal Access Token** con acceso **solo al repo
`hourly-malaphor`** y permiso **Repository contents: Read and write**:

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*.
2. *Resource owner*: tu usuario. *Repository access*: **Only select repositories** → `hourly-malaphor`.
3. *Permissions* → Repository permissions → **Contents: Read and write** y
   **Actions: Read and write** (esto último para el botón *Enviar ahora*).
4. Generá, copiá el token y pegalo en **Configuración** del dashboard.

Como es de alcance mínimo (un repo, solo Contents), el riesgo es bajo. Podés
revocarlo cuando quieras.

## Uso local

Es estático: `index.html` + `app.js` + `style.css`. Abrilo con cualquier server
estático o directamente desde GitHub Pages.
