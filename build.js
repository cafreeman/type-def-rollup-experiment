const path = require('path');
const fs = require('fs-extra');
const klaw = require('klaw');
const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor');
const { rollup } = require('rollup');
const typescript = require('@rollup/plugin-typescript');
const { default: dts } = require('rollup-plugin-dts');
// const typescript = require('rollup-plugin-typescript2');

async function findPackages() {
  const items = [];

  for await (const item of klaw(path.join(__dirname, 'src/packages'))) {
    if (item.stats.isFile()) {
      if (!path.basename(item.path).startsWith('-')) {
        items.push(new Package(item.path));
        // const relativeSrcPath = path.relative(__dirname, item.path);
        // item.srcPath = path.parse(relativeSrcPath);
        // const relativeOutPath = path.relative(path.join(__dirname, 'src/packages'), item.path);
        // item.outPath = path.parse(relativeOutPath);
        // delete item.stats;
        // items.push(item);
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
  // const srcPath = path.relative(__dirname, file.path);
  // const parsedSrcPath = path.parse(srcPath);

  // const outPath = path.relative(path.join(__dirname, 'src/packages'), file.path);
  // const parsedOutPath = path.parse(outPath);

  // const outPath = replaceExtension(
  //   path.relative(path.join(__dirname, 'src/packages'), file.path),
  //   '.js'
  // );

  const bundle = await rollup({
    input: package.absolutePath,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        include: [`${package.srcPath.dir}/**/*.ts`],
        // include: file.path,
        outDir: `out/${package.outPath.dir}`,
        declarationDir: `out/${package.outPath.dir}`,
      }),
    ],
  });

  return bundle.write({
    output: {
      // file: `out/${outPath}`,
      dir: `out/${package.outPath.dir}`,
      format: 'es',
      sourcemap: true,
      // preserveModules: true,
    },
  });
}

async function rollupTypes(package) {
  const bundle = await rollup({
    input: path.format({
      dir: `out/${package.outPath.dir}`,
      name: package.outPath.name,
      ext: '.d.ts',
    }),
    plugins: [dts()],
  });

  package.rollup = {
    dir: `out/${package.outPath.dir}`,
    name:
      package.outPath.name === 'index'
        ? `rollup.${package.outPath.dir}`
        : `rollup.${package.outPath.name}`,
    ext: '.d.ts',
  };

  return bundle.write({
    output: {
      file: path.format({
        // dir: `out/${package.outPath.dir}`,
        // name:
        //   package.outPath.name === 'index'
        //     ? `rollup.${package.outPath.dir}`
        //     : `rollup.${package.outPath.name}`,
        dir: package.rollup.dir,
        name: package.rollup.name,
        ext: package.rollup.ext,
      }),
      format: 'es',
    },
  });
}

function replaceExtension(filePath, newExt) {
  const { dir, name } = path.parse(filePath);

  return path.format({
    dir,
    name,
    ext: newExt,
  });
}

//
// YOU ARE HERE. YOU NEED TO MAKE THIS DYNAMIC AND HAVE IT BUILD UP ALL THE PACKAGE NAME INFO
// FROM THE ROLLED UP .D.TS FILES
//
function docs(package) {
  console.log('package', package);
  const config = ExtractorConfig.prepare({
    configObject: {
      // mainEntryPointFilePath: path.join(__dirname, 'out/foo/rollup.foo.d.ts'),
      mainEntryPointFilePath: path.join(__dirname, path.format(package.rollup)),
      apiReport: {
        enabled: true,
        // reportFileName: 'foo.api.md',
        reportFileName: `${package.fileSafeName}.api.md`,
        reportFolder: 'temp',
        reportTempFolder: 'temp',
      },
      docModel: {
        enabled: true,
        apiJsonFilePath: path.resolve(__dirname, 'temp', `${package.fileSafeName}.api.json`),
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
