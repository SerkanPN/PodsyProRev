const fs = require('fs');
const path = require('path');
const getImports = (filePath) => {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const regex = /import\s+.*?\s+from\s+['\"'](.*?)['\"']/g;
    let match; const imports = [];
    while ((match = regex.exec(code)) !== null) {
      if (match[1].startsWith('.')) imports.push(match[1]);
    }
    return imports;
  } catch (e) { return []; }
};

const walkSync = (dir, filelist = []) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      filelist = walkSync(filepath, filelist);
    } else if (filepath.endsWith('.tsx') || filepath.endsWith('.ts')) {
      filelist.push(filepath);
    }
  }
  return filelist;
};

const allFiles = walkSync('src');
for (const file of allFiles) {
  const imports = getImports(file);
  if (imports.length > 0) {
    console.log(file, ':', imports);
  }
}

