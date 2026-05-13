---
priority: 2
---
# Setup
## Standard Projct Structure
If your project is structured the way that Roku expects, then the language features will work with no configuration needed. Here are the default file patterns we use to find files:
```javascript
[
    "source/**/*",
    "components/**/*",
    "images/**/*",
    "manifest"
]
```

And here's an example file structure:

```text
C:/Projects/YourAwesomeApp/
  ├─ manifest
  ├─ images/
  │ └─ logo.jpeg
  ├─ components/
  │ ├─ HomeScene.brs
  │ └─ HomeScene.xml
  └─ source/
    └─ main.brs
```


## brsconfig.json
If your standard BrightScript project doesn't match the layout above — extra folders, a subdirectory layout, etc. — create a `brsconfig.json` at the root of your project. It tells the language server where your files live so intellisense, navigation, and diagnostics work correctly.

Supported properties:

- `files` — file globs describing which files belong to the project
- `rootDir` — the project root (must contain `manifest`)
- `logLevel` — `off` | `error` | `warn` | `log` | `info` | `debug` | `trace`

> **Note:** A file named `brsconfig.json` previously existed in older versions of this extension with a different meaning. Today it has the specific, narrower purpose described here. If you're using BrighterScript, see [bsconfig.json](#bsconfigjson) below instead.

### Extra folders
If your project has folders not part of the standard Roku structure, specify all of the necessary files via `files`.

Consider this project that includes a `config/` folder:
```text
C:/Projects/YourAwesomeApp/
  ├─ manifest
  ├─ images/
  │ └─ logo.jpeg
  ├─ components/
  │ ├─ HomeScene.brs
  │ └─ HomeScene.xml
  ├─ source/
  | └─ main.brs
  └─ config/
    ├─ dev.json
    ├─ test.json
    └─ prod.json
```

You would create the following `brsconfig.json`:
```javascript
{
    "files": [
        //default entries
        "source/**/*",
        "components/**/*",
        "images/**/*",
        "manifest",
        //your custom entries
        "config/**/*"
    ]
}
```

### Subdirectory
If your project lives in a subdirectory, set `rootDir`.

Consider this project:

```text
C:/Projects/YourAwesomeApp/
  ├─ docs/
  │ └─ setup.md
  └─ src/
    ├─ manifest
    ├─ components/
    | └─ HomeScene.xml
    └─ source/
      └─ main.brs
```

You would create the following `brsconfig.json`:

```javascript
{
    "rootDir": "./src"
}
```

### Subdirectory and Extra Folders

If your code is in a subdirectory and you have extra folders:
```text
C:/Projects/YourAwesomeApp/
  ├─ docs/
  │ └─ setup.md
  └─ src/
    ├─ manifest
    ├─ components/
    | └─ HomeScene.xml
    ├─ source/
    | └─ main.brs
    └─ config/
      ├─ dev.json
      ├─ test.json
      └─ prod.json
```

You would create the following `brsconfig.json`:

```json
{
  "rootDir": "./src",
  "files": [
      //every file under the `src` folder should be included in the package
      "**/*"
  ]
}
```

### Sharing brsconfig.json with your debugger

Point your `launch.json` at it via the `brsconfigPath` property so you don't have to duplicate `files` / `rootDir` / `logLevel` in both places. See [Debugging: Using `brsconfig.json` for standard BrightScript projects](../Debugging/index.md#using-brsconfigjson-for-standard-brightscript-projects).

## bsconfig.json
If you're using BrighterScript, you already have a `bsconfig.json` for the compiler — the language server reads it directly, so you don't need a separate `brsconfig.json`.

For project structure, `bsconfig.json` supports the same `files`, `rootDir`, and `logLevel` properties shown in the [brsconfig.json](#brsconfigjson) examples above — just use `bsconfig.json` as the filename. On top of that, it carries the full BrighterScript compiler config. See [the BrighterScript docs](https://github.com/rokucommunity/brighterscript#bsconfigjson-options) for the complete list of options.
