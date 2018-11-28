# Developer Guidelines

## Code Conventions
- boolean variables should have a logical word at or near the beginning of the name. Also, try to use variables that indicate the truthy state of the item instead of the falsey state.
    - Use `isActive` instead of `active`
    - Use `wasProcessed` instead of `processed` 
    - Use `isCompleted` instead of `isNotCompleted`

- Variable names should be `PascalCase` for classes and `camelCase` for variables, methods, functions and properties.

- Class constructors should be the first item in the class, above all methods and properties.

- All imports should be on their own line. 
    ```typescript
    //incorrect
    import {A, B} from 'somewhere';
    import {C} from 'c'; import {D} from 'd';

    //correct
    import {
        A,
        B
    } from 'somewhere;
    import {C} from 'c';
    import {D} from 'd';
    ```

## Pull Requests

- All TSLint and TypeScript errors must pass before a pull request will be accepted. 

- Pull requests must include unit tests proving that the new or changed functionality works properly. This is also helps to detect regressions that may be introduced in future changes.


## Thanks!

Thanks for your interest in contributing!