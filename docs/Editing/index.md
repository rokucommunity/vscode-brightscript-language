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


## Choosing a config file: `brsconfig.json` vs `bsconfig.json`

If your project structure doesn't match the Roku defaults (or you want extra files, a subdirectory layout, etc.), you'll need a config file so the language server understands your project. There are two options, and which one you use depends on whether your project is vanilla BrightScript or BrighterScript:

- **`brsconfig.json`** — for **vanilla BrightScript** projects (no BrighterScript compiler). Carries project-structure metadata only — `files`, `rootDir`, `cwd`, `logLevel`. Nothing else.
- **`bsconfig.json`** — for **BrighterScript** projects. The full compiler config, including everything in `brsconfig.json` plus many more options.

If you're not using BrighterScript, use `brsconfig.json` to keep things lightweight. The sections below describe `bsconfig.json`, but the same `files` / `rootDir` examples apply identically to `brsconfig.json`.

> **Note:** A file named `brsconfig.json` previously existed in older versions of this extension with a different meaning. Today it has the specific, narrower purpose described above.

### Using `brsconfig.json` with your debugger

If you set up a `brsconfig.json` for the language server, you can also point your `launch.json` at it via the `brsconfigPath` property to avoid duplicating `files` / `rootDir` / `cwd` / `logLevel` between the two files. See [Debugging: Using `brsconfig.json` for vanilla BrightScript projects](../Debugging/index.md#using-brsconfigjson-for-vanilla-brightscript-projects).

## bsconfig.json
In all other situations, you will need to create a `bsconfig.json` file at the root of your project. The following sections describe the various settings you can utilize to help VSCode to better understand your project

## Extra folders
If your project has folders not part of the standard Roku structure, then you will need to specify all of the necessary files in the 

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

You would create the following `bsconfig.json`
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

## Subdirectory
If your project lives in a subdirectory, you should add a `rootDir` property to the `bsconfig.json`. 

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

You would have the following `bsconfig.json`:

```javascript
{
    "rootDir": "./src"
}
```

## Subdirectory and Extra Folders

If your code is in a subdirectory and you have extra folders
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

You would have the following `bsconfig.json`:

```json
{
  "rootDir": "./src",
  "files": [
      //every file under the `src` folder should be included in the package
      "**/*"
  ]
}
```

## Additional Options
This project relies heavily on the [brighterscript](https://github.com/rokucommunity/brighterscript) project for language server support. See [this link](https://github.com/rokucommunity/brighterscript#bsconfigjson-options) to view all of the available `bsconfig.json` options.
