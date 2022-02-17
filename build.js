const path = require('path');
const fs = require('fs-extra');
const klaw = require('klaw');
const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor');
const { rollup } = require('rollup');
const typescript = require('@rollup/plugin-typescript');
const { default: dts } = require('rollup-plugin-dts');

async function findPackages() {
  const items = [];

  for await (const item of klaw(path.join(__dirname, 'src/packages'))) {
    if (item.stats.isFile()) {
      if (!path.basename(item.path).startsWith('-')) {
        items.push(new Package(item.path));
      }
    }
  }

  return items;
}

class Package {
  constructor(filePath) {
    this.absolutePath = filePath;

    const relativeSrcPath = path.relative(__dirname, filePath);
    this.srcPath = path.parse(relativeSrcPath);

    const relativeOutPath = path.relative(path.join(__dirname, 'src/packages'), filePath);
    this.outPath = path.parse(relativeOutPath);

    this.name =
      this.outPath.name === 'index' ? this.outPath.dir : `${this.outPath.dir}/${this.outPath.name}`;

    this.rollup = {
      dir: `out/${this.outPath.dir}`,
      name: `rollup.${this.name.replace('/', '.')}`,
      ext: '.d.ts',
    };
  }

  get fileSafeName() {
    if (!this._fileSafeName) {
      this._fileSafeName = this.name.replace('/', '.');
    }
    return this._fileSafeName;
  }
}

async function build(package) {
  const bundle = await rollup({
    input: package.absolutePath,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        include: [`${package.srcPath.dir}/**/*.ts`],
        outDir: `temp/${package.outPath.dir}`,
        declarationDir: `temp/${package.outPath.dir}`,
      }),
    ],
  });

  return bundle.write({
    output: {
      dir: `temp/${package.outPath.dir}`,
      format: 'es',
      sourcemap: true,
    },
  });
}

async function rollupTypes(package) {
  const bundle = await rollup({
    input: path.format({
      dir: `temp/${package.outPath.dir}`,
      name: package.outPath.name,
      ext: '.d.ts',
    }),
    plugins: [dts()],
  });

  return bundle.write({
    output: {
      file: path.format(package.rollup),
      format: 'es',
    },
  });
}

function docs(package) {
  const config = ExtractorConfig.prepare({
    configObject: {
      mainEntryPointFilePath: path.join(__dirname, path.format(package.rollup)),
      apiReport: {
        enabled: true,
        reportFileName: `${package.fileSafeName}.api.md`,
        reportFolder: 'out',
        reportTempFolder: 'out',
      },
      docModel: {
        enabled: true,
        apiJsonFilePath: path.resolve(__dirname, 'out', `${package.fileSafeName}.api.json`),
      },
      compiler: {
        tsconfigFilePath: '<projectFolder>/tsconfig.json',
      },
      projectFolder: __dirname,
    },
  });

  config.packageFolder = __dirname;
  config.packageJson = {
    name: package.fileSafeName,
  };

  const result = Extractor.invoke(config, {
    localBuild: true,
    showVerboseMessages: true,
  });
}

async function run() {
  const packages = await findPackages();
  await Promise.all(
    packages.map((pkg) => {
      return build(pkg);
    })
  );

  await Promise.all(
    packages.map((pkg) => {
      return rollupTypes(pkg);
    })
  );

  await Promise.all(
    packages.map((pkg, idx) => {
      return docs(pkg);
    })
  );
}

run();
