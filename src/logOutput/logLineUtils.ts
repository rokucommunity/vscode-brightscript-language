/**
 * BrightScript runtime error codes, used to add a description next to codes like `&hF4` in the log output
 */
export const ERROR_CODES: ReadonlyMap<string, string> = new Map<string, string>([
    ['&h00', '(ERR_NF: next without for)'],
    ['&h02', '(ERR_SYNTAX): syntax error'],
    ['&h04', '(ERR_RG: return without gosub)'],
    ['&h06', '(ERR_OD: out of data (READ))'],
    ['&h08', '(ERR_FC: invalid parameter passed to function/array (e.g neg matrix dim or square root))'],
    ['&h0C', '(ERR_OUTOFMEM: out of memory)'],
    ['&h0E', '(ERR_MISSING_LN: missing line)'],
    ['&h10', '(ERR_BS: array subscript out of bounds)'],
    ['&h12', '(ERR_DD: attempted to redimension an array)'],
    ['&h14', '(ERR_DIV_ZERO: divide by zero error)'],
    ['&h18', '(ERR_TM: type mismatch (string / numeric operation mismatch))'],
    ['&h1A', '(ERR_OS: out of string space)'],
    ['&h1C', '(ERR_STRINGTOLONG: error parsing string to long)'],
    ['&h20', '(ERR_CN: continue not allowed)'],
    ['&h9F', '(ERR_INVALID_CONST_NAME: invalid constant name)'],
    ['&hA0', '(ERR_VAR_CANNOT_BE_SUBNAME: invalid subroutine name)'],
    ['&hA1', '(ERR_TOO_MANY_LABELS)'],
    ['&hA2', '(ERR_RO_NOT_FOUND:)'],
    ['&hA3', '(ERR_IF_TOO_LARGE:)'],
    ['&hA4', '(ERR_MISSING_INITILIZER:)'],
    ['&hA5', '(ERR_EXIT_FOR_NOT_IN_FOR: exit for statement found when not in for loop)'],
    ['&hA6', '(ERR_NOLONGER: no longer supported)'],
    ['&hA7', '(ERR_INVALID_TYPE: invalid typhe)'],
    ['&hA8', '(ERR_FUN_MUST_HAVE_RET_TYPE: function must have a return type)'],
    ['&hA9', '(ERR_RET_MUST_HAVE_VALUE: return statement must have a value)'],
    ['&hAA', '(ERR_RET_CANNOT_HAVE_VALUE: return statement cannot have a value)'],
    ['&hAB', '(ERR_FOREACH_INDEX_TM)'],
    ['&hAC', '(ERR_NOMAIN: no main function present)'],
    ['&hAD', '(ERR_SUB_DEFINED_TWICE: sub defined twice)'],
    ['&hAE', '(ERR_INTERNAL_LIMIT_EXCEDED: internal limit exceeded)'],
    ['&hAF', '(ERR_EXIT_WHILE_NOT_IN_WHILE: exit while statement found when not in while loop)'],
    ['&hB0', '(ERR_TOO_MANY_VAR: too many variables)'],
    ['&hB1', '(ERR_TOO_MANY_CONST: too many constants)'],
    ['&hB2', '(ERR_FUN_NOT_EXPECTED: function not expected)'],
    ['&hB3', '(ERR_UNTERMED_STRING: literal string does not have ending quote)'],
    ['&hB4', '(ERR_LABELTWICE: label defined more than once)'],
    ['&hB5', '(ERR_NO_BLOCK_END: no end to block)'],
    ['&hB6', '(ERR_FOR_NEXT_MISMATCH: variable on a NEXT does not match that for the FOR)'],
    ['&hB7', '(ERR_UNEXPECTED_EOF: end of string being compiled encountered when not expected (missing end of block usually))'],
    ['&hB8', '(ERR_NOMATCH: "match" statement did not match)'],
    ['&hB9', '(ERR_LOADFILE: error loading a file)'],
    ['&hBA', '(ERR_LNSEQ: line number sequence error)'],
    ['&hBB', '(ERR_NOLN: no line number found)'],
    ['&hBC', '(ERR_MISSING_ENDIF: end of code reached without finding ENDIF)'],
    ['&hBE', '(ERR_MISSING_ENDWHILE: while statement is missing a matching endwhile)'],
    ['&hBF', '(ERR_NW: endwhile with no while)'],
    ['&hDF', '(ERR_STACK_OVERFLOW): stack overflow error'],
    ['&hE0', '(ERR_NOTFUNOPABLE)'],
    ['&hE1', '(ERR_UNICODE_NOT_SUPPORTED: unicode character not supported)'],
    ['&hE2', '(ERR_VALUE_RETURN: return executed, and a value returned on the stack)'],
    ['&hE3', '(ERR_INVALID_NUM_ARRAY_IDX: invalid number of array indexes)'],
    ['&hE4', '(ERR_INVALID_LVALUE: invalid left side of expression)'],
    ['&hE5', '(ERR_MUST_HAVE_RETURN: function must have return value)'],
    ['&hE6', '(ERR_USE_OF_UNINIT_BRSUBREF: used a reference to SUB that is not initialized)'],
    ['&hE7', '(ERR_ARRAYNOTDIMMED: array has not been dimensioned)'],
    ['&hE8', '(ERR_TM2: non-numeric index to array)'],
    ['&hE9', '(ERR_USE_OF_UNINIT_VAR: illegal use of uninitialized var)'],
    ['&hEB', '(ERR_NOTYPEOP: operation on two typeless operands attempted)'],
    ['&hEC', '(ERR_RO4: . (dot) operator used on a variable that does not contain a legal object or interface reference)'],
    ['&hED', '(ERR_MUST_BE_STATIC: interface calls from type rotINTERFACE must be static)'],
    ['&hEE', '(ERR_NOTWAITABLE: tried to wait on a function that does not have MessagePort interface)'],
    ['&hEF', '(ERR_NOTPRINTABLE: non-printable value)'],
    ['&hF0', '(ERR_RVIG: function returns a value, but is ignored)'],
    ['&hF1', '(ERR_WRONG_NUM_PARAM: incorect number of function parameters)'],
    ['&hF2', '(ERR_TOO_MANY_PARAM: too many function parameters to handle)'],
    ['&hF3', '(ERR_RO3: interface not a member of object)'],
    ['&hF4', '(ERR_RO2: member function not found in object or interface)'],
    ['&hF5', '(ERR_RO1: function call does not have the right number of parameters)'],
    ['&hF6', '(ERR_RO0: bscNewComponent failed because object class not found)'],
    ['&hF7', '(ERR_STOP: stop statement executed)'],
    ['&hF8', '(ERR_BREAK: scriptBreak() called)'],
    ['&hF9', '(ERR_STACK_UNDER: nothing on stack to pop)'],
    ['&hFA', '(ERR_MISSING_PARN)'],
    ['&hFB', '(ERR_UNDEFINED_OP: an expression operator that we do not handle)'],
    ['&hFC', '(ERR_NORMAL_END: normal, but terminate execution.  END, shell "exit", window closed, etc'],
    ['&hFD', '(ERR_UNDEFINED_OPCD: an opcode that we do not handle )'],
    ['&hFE', '(ERR_INTERNAL: a condition that should not occur did)'],
    ['&hFF', '(ERR_OKAY)']
]);

/**
 * Add a description after every known error code (i.e. `&hF4`) in the text
 */
export function annotateErrorCodes(text: string): string {
    if (!text.includes('&h')) {
        return text;
    }
    return text.replace(/&h[0-9A-F]{2}/g, (code) => {
        const description = ERROR_CODES.get(code);
        return description ? `${code} ${description} ` : code;
    });
}

/**
 * Catches a few different file reference formats:
 *  - pkg:/path/file.brs(LINE:COL)
 *  - file://path/file.bs:LINE
 *  - at line LINE of file pkg:/path/file.brs - this case can arise when the device reports various scenegraph errors such as fields not present, or texture size issues, etc
 */
const fileReferenceRegex = /(?:\s*at line (\d*) of file )*(?:(pkg:\/|file:\/\/)(.*\.(bs|brs|xml)))[ \t]*(?:(?:(?:\()(\d+)(?:\:(\d+))?\)?)|(?:\:(\d+)?))*/;

export interface FileReference {
    /**
     * Where the reference starts in the line
     */
    index: number;
    /**
     * The length of the reference text in the line
     */
    length: number;
    /**
     * `pkg:/path/file.brs` for pkg references, or the file system path for `file://` references
     */
    path: string;
    isFilePath: boolean;
    /**
     * The 1-based line number in the referenced file
     */
    lineNumber: number;
    /**
     * The lower case file extension, including the leading dot (i.e. `.brs`)
     */
    extension: string;
    /**
     * The file name without its extension
     */
    filename: string;
}

/**
 * Find the first file reference in a line of log output
 */
export function findFileReference(text: string): FileReference | undefined {
    const match = fileReferenceRegex.exec(text);
    if (!match) {
        return undefined;
    }
    const isFilePath = match[2] === 'file://';
    const path = isFilePath ? match[3] : 'pkg:/' + match[3];
    let lineNumber = match[1] ? Number(match[1]) : undefined;
    if (!lineNumber) {
        lineNumber = Number(match[5]);
        if (isFilePath && match[7] !== undefined) {
            lineNumber = Number(match[7]);
        }
    }
    return {
        index: match.index,
        length: match[0].length,
        path: path,
        isFilePath: isFilePath,
        lineNumber: lineNumber,
        extension: `.${match[4]}`.toLowerCase(),
        filename: getFilenameWithoutExtension(path)
    };
}

export function getFilenameWithoutExtension(filePath: string): string {
    const name = filePath.split('/').pop();
    const lowerName = name.toLowerCase();
    if (lowerName.endsWith('.xml') || lowerName.endsWith('.brs')) {
        return name.substring(0, name.length - 4);
    } else if (lowerName.endsWith('.bs')) {
        return name.substring(0, name.length - 3);
    }
    return name;
}
