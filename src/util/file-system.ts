import * as fs from 'fs';
import * as path from 'path';
import * as flatten from 'flattenjs';
import { arrayToString } from '../util/array-as-string';

export type FileType = 'key-based' | 'natural' | 'auto';

export const getAvailableLanguages = (directory: string) =>
  fs
    .readdirSync(directory)
    .map(d => path.resolve(directory, d))
    .filter(d => fs.statSync(d).isDirectory())
    .map(d => path.basename(d));

export const detectFileType = (json: any): FileType => {
  const invalidKeys = Object.keys(json).filter(
    k => typeof json[k] === 'string' && (k.includes('.') || k.includes(' ')),
  );

  return invalidKeys.length > 0 ? 'natural' : 'key-based';
};

export const loadTranslations = (
  directory: string,
  fileType: FileType = 'auto',
) =>
  fs
    .readdirSync(directory)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const json = require(path.resolve(directory, f));
      const type = fileType === 'auto' ? detectFileType(json) : fileType;

      return {
        name: f,
        originalContent: json,
        type,
        content:
          type === 'key-based'
            ? flatten.convert(arrayToString(require(path.resolve(directory, f))))
            : require(path.resolve(directory, f)),
      };
    });

export const fixSourceInconsistencies = (directory: string) => {
  const files = loadTranslations(directory).filter(f => f.type === 'natural');

  for (const file of files) {
    const fixedContent = Object.keys(file.content).reduce(
      (acc, cur) => ({ ...acc, [cur]: cur }),
      {} as { [k: string]: string },
    );

    fs.writeFileSync(
      path.resolve(directory, file.name),
      JSON.stringify(fixedContent, null, 2) + '\n',
    );
  }
};
