/**
 * Generates the reference pages from the extension's package.json, so they can't drift from what the extension actually ships:
 *   - extension-settings.md                 every setting in `contributes.configuration`, grouped by its category title
 *   - debugging/launch-configuration.md     every `launch.json` option in `contributes.debuggers[0].configurationAttributes.launch`
 *
 * Each page is plain markdown that's committed (so it reads fine on GitHub too). Everything above the `reference:start` marker
 * is hand-written and kept as-is. Below it, each setting gets a heading and a generated block between `generated:start` and
 * `generated:end` markers. Anything you write right after a setting's `generated:end` marker (up to the next `##`/`###`
 * heading) is kept too, so extra notes and examples can live next to the generated text.
 *
 * To change a description, edit package.json (that's also what VS Code shows in its settings UI and hovers).
 * `npm run docs` / `npm run build-docs` regenerate the pages. In CI, the build fails instead if a page is out of date or a
 * setting has no description.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { docsDir, repoDir } from '../config.mjs';

const startMarker = '<!-- reference:start: everything below is generated from package.json by docs/scripts/reference.mjs. Edit descriptions there. Notes written right after a setting\'s generated:end marker are kept. -->';
const blockStart = '<!-- generated:start -->';
const blockEnd = '<!-- generated:end -->';

const launchPagePath = 'debugging/launch-configuration.md';

/**
 * The heading anchor docusaurus generates for a heading like `` `brightscript.debug.host` `` (github-slugger rules)
 */
function slugOf(text) {
    return text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

/**
 * Escape `<` outside of inline code, so a description like "a <placeholder>" isn't treated as an html tag
 */
function escapeMarkdown(text) {
    return text.split(/(`[^`]*`)/).map((part, i) => (i % 2 === 1 ? part : part.replace(/</g, '&lt;'))).join('');
}

function descriptionOf(schema) {
    return schema.markdownDescription ?? schema.description;
}

function typeOf(schema) {
    if (schema.oneOf || schema.anyOf) {
        return [...new Set((schema.oneOf ?? schema.anyOf).map(typeOf))].join(' | ');
    }
    const types = Array.isArray(schema.type) ? schema.type : [schema.type ?? 'any'];
    return types.map(x => (x === 'array' && schema.items?.type && !Array.isArray(schema.items.type) ? `${schema.items.type}[]` : x)).join(' | ');
}

/**
 * Render a value inline (i.e. `"${promptForHost}"`), or as a json code block when it's too big for that
 */
function renderValue(value) {
    const inline = JSON.stringify(value);
    if (inline.length <= 60 && !inline.includes('`')) {
        return { inline: `\`${inline}\`` };
    }
    return { block: ['```json', JSON.stringify(value, null, 4), '```'].join('\n') };
}

/**
 * The allowed values for a setting, from `enum` (with `enumDescriptions`) or from `anyOf`/`oneOf` alternatives that are single-value enums
 */
function allowedValuesOf(schema) {
    if (schema.enum) {
        const descriptions = schema.markdownEnumDescriptions ?? schema.enumDescriptions ?? [];
        return schema.enum.map((value, i) => ({ value: value, description: descriptions[i] }));
    }
    const alternatives = schema.items?.anyOf ?? schema.items?.oneOf ?? schema.anyOf;
    if (alternatives?.some(x => x.enum?.length === 1)) {
        return alternatives.map(x => (x.enum?.length === 1 ? { value: x.enum[0], description: descriptionOf(x) } : { value: undefined, description: descriptionOf(x) }));
    }
    return undefined;
}

/**
 * One level of nested properties (i.e. each component library's `rootDir`, `outFile`, ...)
 */
function renderProperties(schema, indent = '') {
    const objectSchema = schema.properties ? schema : schema.items?.properties ? schema.items : undefined;
    if (!objectSchema) {
        return [];
    }
    const required = new Set(objectSchema.required ?? []);
    const lines = [];
    for (const [name, property] of Object.entries(objectSchema.properties)) {
        const details = [typeOf(property), required.has(name) ? 'required' : undefined].filter(Boolean).join(', ');
        const description = descriptionOf(property) ?? descriptionOf(property.oneOf?.[0] ?? {});
        lines.push(`${indent}- \`${name}\` (${details})${description ? `: ${escapeMarkdown(description).replace(/\s*\n\s*/g, ' ')}` : ''}`);
        //(one more level for things like fileLogging.rokuDevice.*)
        const nested = property.properties ? property : property.oneOf?.find(x => x.properties);
        if (nested && indent === '') {
            lines.push(...renderProperties(nested, '    '));
        }
    }
    return lines;
}

/**
 * The generated markdown for one setting (without its heading)
 */
function renderSchema(schema, { seeAlso } = {}) {
    const lines = [];
    if (schema.deprecationMessage || schema.markdownDeprecationMessage) {
        lines.push('> [!WARNING]', `> **Deprecated.** ${escapeMarkdown(schema.markdownDeprecationMessage ?? schema.deprecationMessage)}`, '');
    }
    const description = descriptionOf(schema);
    if (description) {
        lines.push(escapeMarkdown(description), '');
    }
    if (seeAlso) {
        lines.push(seeAlso, '');
    }

    const facts = [`**Type:** \`${typeOf(schema)}\``];
    let defaultBlock;
    if (schema.default !== undefined) {
        const value = renderValue(schema.default);
        if (value.inline) {
            facts.push(`**Default:** ${value.inline}`);
        } else {
            defaultBlock = value.block;
        }
    }
    lines.push(facts.join(' · '), '');
    if (defaultBlock) {
        lines.push('**Default:**', '', defaultBlock, '');
    }

    //`oneOf` alternatives with their own descriptions (i.e. `true`, or an object with more options)
    const alternatives = (schema.oneOf ?? []).filter(x => descriptionOf(x));
    if (alternatives.length > 1 && !description) {
        lines.push('One of:', '', ...alternatives.map(x => `- \`${typeOf(x)}\`: ${escapeMarkdown(descriptionOf(x))}`), '');
    }

    const allowed = allowedValuesOf(schema);
    if (allowed) {
        lines.push('Allowed values:', '', ...allowed.map(x => {
            const value = x.value === undefined ? '_any other value_' : `\`${JSON.stringify(x.value)}\``;
            return `- ${value}${x.description ? `: ${escapeMarkdown(x.description)}` : ''}`;
        }), '');
    }

    const properties = renderProperties(schema.properties ? schema : schema.oneOf?.find(x => x.properties) ?? schema);
    if (properties.length > 0) {
        lines.push('Properties:', '', ...properties, '');
    }

    const examples = schema.examples ?? (schema.items?.examples);
    if (examples?.length > 0) {
        lines.push('Example:', '', renderValue(examples[0]).inline ?? renderValue(examples[0]).block, '');
    }
    return lines.join('\n').trim();
}

/**
 * Does this setting (or `launch.json` option) have something to say about itself?
 */
function isDescribed(schema) {
    return !!(descriptionOf(schema) || schema.deprecationMessage || (schema.oneOf ?? []).some(x => descriptionOf(x)));
}

/**
 * Parse a reference page into its hand-written intro and the notes written after each setting's generated block
 */
function parsePage(text) {
    const index = text.indexOf(startMarker);
    const intro = (index >= 0 ? text.substring(0, index) : text).trimEnd();
    const notes = new Map();
    if (index >= 0) {
        let key;
        let collecting = false;
        let buffer = [];
        const flush = () => {
            if (key && buffer.join('\n').trim()) {
                notes.set(key, buffer.join('\n').trim());
            }
            buffer = [];
            collecting = false;
        };
        for (const line of text.substring(index + startMarker.length).split(/\r?\n/)) {
            if (/^#{2,3}\s/.test(line)) {
                flush();
                key = /^###\s+`([^`]+)`/.exec(line)?.[1];
            } else if (line.trim() === blockEnd) {
                collecting = true;
            } else if (collecting) {
                buffer.push(line);
            }
        }
        flush();
    }
    return { intro: intro, notes: notes };
}

/**
 * Build a page: the intro, then each group (`## title`) of settings (`### key`) with their generated block and kept notes
 * @param {Array<{ title?: string; entries: Array<{ key: string; markdown: string }> }>} groups
 */
function renderPage(existingText, defaultIntro, groups) {
    const { intro, notes } = parsePage(existingText ?? defaultIntro);
    const lines = [intro, '', startMarker, ''];
    const used = new Set();
    for (const group of groups) {
        if (group.title) {
            lines.push(`## ${group.title}`, '');
        }
        for (const entry of group.entries) {
            lines.push(`### \`${entry.key}\``, blockStart, entry.markdown, blockEnd);
            if (notes.has(entry.key)) {
                lines.push('', notes.get(entry.key));
                used.add(entry.key);
            }
            lines.push('');
        }
    }
    const orphanedNotes = [...notes.keys()].filter(x => !used.has(x));
    return { text: lines.join('\n').trimEnd() + '\n', orphanedNotes: orphanedNotes };
}

function readPackageJson() {
    return JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
}

const settingsIntro = `# Extension Settings

These are all of the settings the extension contributes. Set them in your user or workspace \`settings.json\`, or search for \`brightscript\` in VS Code's settings UI.
`;

const launchIntro = `# Launch Configuration

These are all of the options for a \`brightscript\` debug configuration in \`.vscode/launch.json\`. See [Debugging Setup](index.md) to get started.

Most of these can also be set for every launch configuration at once with the matching \`brightscript.debug.*\` setting in your user or workspace settings. A value in \`launch.json\` always wins over the setting.
`;

/**
 * Generate both pages. Returns what's out of date (and writes the new pages when `write` is true)
 */
export function syncReferencePages(options) {
    const packageJson = readPackageJson();
    const configuration = [].concat(packageJson.contributes.configuration);
    const launchProperties = packageJson.contributes.debuggers[0].configurationAttributes.launch.properties;
    const problems = [];

    const settingsGroups = configuration.map(group => ({
        title: group.title,
        entries: Object.entries(group.properties ?? {}).map(([key, schema]) => {
            if (!isDescribed(schema)) {
                problems.push(`setting "${key}" in package.json has no description`);
            }
            //brightscript.debug.X is the default for launch.json's X, so link there instead of repeating the details
            const launchKey = key.startsWith('brightscript.debug.') ? key.substring('brightscript.debug.'.length) : undefined;
            const seeAlso = launchKey && launchProperties[launchKey]
                ? `The default for the [\`${launchKey}\`](${launchPagePath}#${slugOf(launchKey)}) option in every \`launch.json\` configuration.`
                : undefined;
            return { key: key, markdown: renderSchema(schema, { seeAlso: seeAlso }) };
        })
    }));

    const launchEntries = Object.entries(launchProperties).map(([key, schema]) => {
        if (!isDescribed(schema)) {
            problems.push(`launch.json option "${key}" in package.json has no description`);
        }
        const settingKey = `brightscript.debug.${key}`;
        const hasSetting = configuration.some(x => x.properties?.[settingKey]);
        const seeAlso = hasSetting ? `Can also be set for every launch configuration with the [\`${settingKey}\`](../extension-settings.md#${slugOf(settingKey)}) setting.` : undefined;
        return { key: key, markdown: renderSchema(schema, { seeAlso: seeAlso }) };
    });

    const pages = [
        { file: 'extension-settings.md', intro: settingsIntro, groups: settingsGroups },
        { file: launchPagePath, intro: launchIntro, groups: [{ entries: launchEntries }] }
    ];
    const outOfDate = [];
    for (const page of pages) {
        const filePath = path.join(docsDir, page.file);
        //(LF everywhere internally. Git may check files out with either line ending)
        const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') : undefined;
        const { text, orphanedNotes } = renderPage(existing, page.intro, page.groups);
        for (const key of orphanedNotes) {
            problems.push(`${page.file} has notes for "${key}", which is no longer in package.json (they'll be dropped)`);
        }
        if (existing !== text) {
            outOfDate.push(page.file);
            if (options.write) {
                fs.writeFileSync(filePath, text.replace(/\n/g, os.EOL));
            }
        }
    }
    return { outOfDate: outOfDate, problems: problems };
}
