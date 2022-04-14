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

```graphql
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


## bsconfig.json
In all other situations, you will need to create a `bsconfig.json` file at the root of your project. The following sections describe the various settings you can utilize to help VSCode to better understand your project

## Extra folders
If your project has folders not part of the standard Roku structure, then you will need to specify all of the necessary files in the 

Consider this project that includes a `config/` folder:
```graphql
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

```graphql
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
```graphql
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
