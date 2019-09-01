#!/usr/bin/env node

import chalk from 'chalk';
import commander from 'commander';
import * as flatten from 'flattenjs';
import * as fs from 'fs';
import { omit } from 'lodash';
import * as path from 'path';

import { serviceMap } from './services';
import {
  loadTranslations,
  getAvailableLanguages,
  fixSourceInconsistencies,
  FileType,
} from './util/file-system';
import { matcherMap } from './matchers';

require('dotenv').config();

commander
  .option(
    '-i, --input <inputDir>',
    'the directory containing language directories',
    '.',
  )
  .option(
    '-l, --source-language <sourceLang>',
    'specify the source language',
    'en',
  )
  .option(
    '-t, --type <key-based|natural|auto>',
    `specify the file structure type`,
    /^(key-based|natural|auto)$/,
    'auto',
  )
  .option(
    '-s, --service <service>',
    `selects the service to be used for translation`,
    'google-translate',
  )
  .option('--list-services', `outputs a list of available services`)
  .option(
    '-m, --matcher <matcher>',
    `selects the matcher to be used for interpolations`,
    'icu',
  )
  .option('--list-matchers', `outputs a list of available matchers`)
  .option(
    '-c, --config <value>',
    'supply a config parameter (e.g. path to key file) to the translation service',
  )
  .option(
    '-f, --fix-inconsistencies',
    `automatically fixes inconsistent key-value pairs by setting the value to the key`,
  )
  .option(
    '-d, --delete-unused-strings',
    `deletes strings in translation files that don't exist in the template`,
  )
  .parse(process.argv);

const translate = async (
  inputDir: string = '.',
  sourceLang: string = 'en',
  deleteUnusedStrings = false,
  fileType: FileType = 'auto',
  fixInconsistencies = false,
  service: keyof typeof serviceMap = 'google-translate',
  matcher: keyof typeof matcherMap = 'icu',
  config?: string,
) => {
  const workingDir = path.resolve(process.cwd(), inputDir);
  const languageFolders = getAvailableLanguages(workingDir);
  const targetLanguages = languageFolders.filter(f => f !== sourceLang);

  if (!languageFolders.includes(sourceLang)) {
    throw new Error(`The source language ${sourceLang} doesn't exist.`);
  }

  if (typeof serviceMap[service] === 'undefined') {
    throw new Error(`The service ${service} doesn't exist.`);
  }

  if (typeof matcherMap[matcher] === 'undefined') {
    throw new Error(`The matcher ${matcher} doesn't exist.`);
  }

  const translationService = serviceMap[service];

  const templateFiles = loadTranslations(
    path.resolve(workingDir, sourceLang),
    fileType,
  );

  if (templateFiles.length === 0) {
    throw new Error(
      `The source language ${sourceLang} doesn't contain any JSON files.`,
    );
  }

  console.log(
    chalk`Found {green.bold ${String(
      targetLanguages.length,
    )}} target language(s):`,
  );
  console.log(`-> ${targetLanguages.join(', ')}`);
  console.log();

  console.log(`🏭 Loading source files...`);
  for (const file of templateFiles) {
    console.log(chalk`├── ${String(file.name)} (${file.type})`);
  }
  console.log(chalk`└── {green.bold Done}`);
  console.log();

  console.log(`✨ Initializing ${translationService.name}...`);
  translationService.initialize(config, matcherMap[matcher]);
  process.stdout.write(chalk`├── Getting available languages `);
  const availableLanguages = await translationService.getAvailableLanguages();
  console.log(
    chalk`({green.bold ${String(availableLanguages.length)} languages})`,
  );
  console.log(chalk`└── {green.bold Done}`);
  console.log();

  if (!availableLanguages.includes(sourceLang)) {
    throw new Error(
      `${
        translationService.name
      } doesn't support the source language ${sourceLang}`,
    );
  }

  console.log(`🔍 Looking for key-value inconsistencies in source files...`);
  const insonsistentFiles: string[] = [];

  for (const file of templateFiles.filter(f => f.type === 'natural')) {
    const inconsistentKeys = Object.keys(file.content).filter(
      key => key !== file.content[key],
    );

    if (inconsistentKeys.length > 0) {
      insonsistentFiles.push(file.name);
      console.log(
        chalk`├── {yellow.bold ${file.name} contains} {red.bold ${String(
          inconsistentKeys.length,
        )}} {yellow.bold inconsistent key(s)}`,
      );
    }
  }

  if (insonsistentFiles.length > 0) {
    console.log(
      chalk`└── {yellow.bold Found key-value inconsistencies in} {red.bold ${String(
        insonsistentFiles.length,
      )}} {yellow.bold file(s).}`,
    );

    console.log();

    if (fixInconsistencies) {
      console.log(`💚 Fixing inconsistencies...`);
      fixSourceInconsistencies(path.resolve(workingDir, sourceLang));
      console.log(chalk`└── {green.bold Fixed all inconsistencies.}`);
    } else {
      console.log(
        chalk`Please either fix these inconsistencies manually or supply the {green.bold -f} flag to automatically fix them.`,
      );
    }
  } else {
    console.log(chalk`└── {green.bold No inconsistencies found}`);
  }
  console.log();

  console.log(`🔍 Looking for invalid keys in source files...`);
  const invalidFiles: string[] = [];

  for (const file of templateFiles.filter(f => f.type === 'key-based')) {
    const invalidKeys = Object.keys(file.originalContent).filter(
      k => typeof file.originalContent[k] === 'string' && k.includes('.'),
    );

    if (invalidKeys.length > 0) {
      invalidFiles.push(file.name);
      console.log(
        chalk`├── {yellow.bold ${file.name} contains} {red.bold ${String(
          invalidKeys.length,
        )}} {yellow.bold invalid key(s)}`,
      );
    }
  }

  if (invalidFiles.length) {
    console.log(
      chalk`└── {yellow.bold Found invalid keys in} {red.bold ${String(
        invalidFiles.length,
      )}} {yellow.bold file(s).}`,
    );

    console.log();
    console.log(
      chalk`It looks like you're trying to use the key-based mode on natural-language-style JSON files.`,
    );
    console.log(
      chalk`Please make sure that your keys don't contain periods (.) or remove the {green.bold --type} / {green.bold -t} option.`,
    );
    console.log();
    process.exit(1);
  } else {
    console.log(chalk`└── {green.bold No invalid keys found}`);
  }
  console.log();

  for (const language of targetLanguages) {
    if (!availableLanguages.includes(language)) {
      console.log(
        chalk`🙈 {yellow.bold ${
          translationService.name
        } doesn't support} {red.bold ${language}}{yellow.bold . Skipping this language.}`,
      );
      console.log();
      continue;
    }

    const existingFiles = loadTranslations(
      path.resolve(workingDir, language),
      fileType,
    );

    console.log(
      chalk`💬 Translating strings from {green.bold ${sourceLang}} to {green.bold ${language}}...`,
    );

    if (deleteUnusedStrings) {
      const templateFileNames = templateFiles.map(t => t.name);
      const deletableFiles = existingFiles.filter(
        f => !templateFileNames.includes(f.name),
      );

      for (const file of deletableFiles) {
        console.log(
          chalk`├── {red.bold ${
            file.name
          } is no longer used and will be deleted.}`,
        );

        fs.unlinkSync(path.resolve(workingDir, language, file.name));
      }
    }

    for (const templateFile of templateFiles) {
      process.stdout.write(`├── Translating ${templateFile.name}`);

      const languageFile = existingFiles.find(
        f => f.name === templateFile.name,
      );
      const existingKeys = languageFile
        ? Object.keys(languageFile.content)
        : [];
      const existingTranslations = languageFile ? languageFile.content : {};

      const templateStrings = Object.keys(templateFile.content);
      const stringsToTranslate = templateStrings
        .filter(key => !existingKeys.includes(key))
        .map((key) => {
          let value = key;
          if (templateFile.type === 'key-based') {
            value = templateFile.content[key];
            value = Array.isArray(value) ? value.join(' ') : value;
          }
          return { key, value };
        });

      const unusedStrings = existingKeys.filter(
        key => !templateStrings.includes(key),
      );

      const translatedStrings = await translationService.translateStrings(
        stringsToTranslate,
        sourceLang.split('-').pop()!,
        language.split('-').pop()!,
      );

      const newKeys = translatedStrings.reduce(
        (acc, cur) => ({ ...acc, [cur.key]: cur.translated }),
        {} as { [k: string]: string },
      );

      if (service !== 'dryRun') {
        const translatedFile = {
          ...omit(
            existingTranslations,
            deleteUnusedStrings ? unusedStrings : [],
          ),
          ...newKeys,
        };

        fs.writeFileSync(
          path.resolve(workingDir, language, templateFile.name),
          JSON.stringify(
            templateFile.type === 'key-based'
              ? flatten.undo(translatedFile)
              : translatedFile,
            null,
            2,
          ) + `\n`,
        );
      }

      console.log(
        deleteUnusedStrings && unusedStrings.length > 0
          ? chalk` ({green.bold +${String(
              translatedStrings.length,
            )}}/{red.bold -${String(unusedStrings.length)}})`
          : chalk` ({green.bold +${String(translatedStrings.length)}})`,
      );
    }

    console.log(chalk`└── {green.bold All strings have been translated.}`);
    console.log();
  }

  console.log(chalk.green.bold('All new strings have been translated!'));
};

if (commander.listServices) {
  console.log('Available services:');
  console.log(Object.keys(serviceMap).join(', '));
  process.exit(0);
}

if (commander.listMatchers) {
  console.log('Available matchers:');
  console.log(Object.keys(matcherMap).join(', '));
  process.exit(0);
}

translate(
  commander.input,
  commander.sourceLanguage,
  commander.deleteUnusedStrings,
  commander.type,
  commander.fixInconsistencies,
  commander.service,
  commander.matcher,
  commander.config,
).catch((e: Error) => {
  console.log();
  console.log(chalk.bgRed('An error has occured:'));
  console.log(chalk.bgRed(e.message));
  console.log(chalk.bgRed(e.stack));
  console.log();
});
