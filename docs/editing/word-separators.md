# Editor Word Separators

By default, VSCode uses `$`, `%`, `!`, `#` and `&` as word separators. Because of this, the full name of a strictly typed String 
(resp. Integer, Float, Double and LongInteger) is not taken as a whole with selection and other word navigation features. You can 
edit the word separator value for BrightScript by adding the following setting:

```
{
    "[brightscript]": {
        "editor.wordSeparators": "`~@^*()-=+[{]}\\|;:'\",.<>/?"
    },
    "[brighterscript]": {
        "editor.wordSeparators": "`~@^*()-=+[{]}\\|;:'\",.<>/?"
    }
}
```
 

