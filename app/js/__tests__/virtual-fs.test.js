import { describe, it, expect } from 'vitest';

describe('VirtualFS', () => {
  it('should create a project with blank template', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    expect(id).toMatch(/^proj_/);
    const projects = VirtualFS.getProjects();
    expect(projects[id]).toBeDefined();
    expect(projects[id].name).toBe('Test');
    expect(projects[id].fileCount).toBe(1);
  });

  it('should create a project with landing-page template', () => {
    const id = VirtualFS.createProject('Landing', 'landing-page');
    const files = VirtualFS.listFiles(id);
    expect(files).toContain('index.html');
    expect(files).toContain('style.css');
    expect(files).toContain('script.js');
    expect(files.length).toBe(3);
  });

  it('should create a project with dashboard template', () => {
    const id = VirtualFS.createProject('Dash', 'dashboard');
    const files = VirtualFS.listFiles(id);
    expect(files).toContain('index.html');
    expect(files).toContain('style.css');
    expect(files).toContain('app.js');
  });

  it('should create a project with edge-function template', () => {
    const id = VirtualFS.createProject('Edge', 'edge-function');
    const files = VirtualFS.listFiles(id);
    expect(files).toContain('index.ts');
  });

  it('should get and set files', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    VirtualFS.setFile(id, 'hello.txt', 'Hello World');
    expect(VirtualFS.getFile(id, 'hello.txt')).toBe('Hello World');
  });

  it('should delete files', () => {
    const id = VirtualFS.createProject('Test', 'landing-page');
    expect(VirtualFS.deleteFile(id, 'script.js')).toBe(true);
    expect(VirtualFS.getFile(id, 'script.js')).toBeNull();
    expect(VirtualFS.listFiles(id)).not.toContain('script.js');
  });

  it('should rename files', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    VirtualFS.setFile(id, 'old.txt', 'content');
    expect(VirtualFS.renameFile(id, 'old.txt', 'new.txt')).toBe(true);
    expect(VirtualFS.getFile(id, 'old.txt')).toBeNull();
    expect(VirtualFS.getFile(id, 'new.txt')).toBe('content');
  });

  it('should delete projects', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    expect(VirtualFS.deleteProject(id)).toBe(true);
    expect(VirtualFS.getProject(id)).toBeNull();
  });

  it('should rename projects', () => {
    const id = VirtualFS.createProject('Old Name', 'blank');
    VirtualFS.renameProject(id, 'New Name');
    expect(VirtualFS.getProjects()[id].name).toBe('New Name');
  });

  it('should build a file tree', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    VirtualFS.setFile(id, 'src/app.js', 'code');
    VirtualFS.setFile(id, 'src/utils/helpers.js', 'helpers');
    const tree = VirtualFS.getFileTree(id);
    expect(tree.type).toBe('folder');
    expect(tree.children.length).toBeGreaterThan(0);
    const src = tree.children.find(c => c.name === 'src');
    expect(src).toBeDefined();
    expect(src.type).toBe('folder');
  });

  it('should sort tree with folders first', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    VirtualFS.setFile(id, 'zebra.txt', 'z');
    VirtualFS.setFile(id, 'alpha/file.txt', 'a');
    const tree = VirtualFS.getFileTree(id);
    // Folders should come before files
    const folderIdx = tree.children.findIndex(c => c.type === 'folder');
    const fileIdx = tree.children.findIndex(c => c.type === 'file');
    if (folderIdx >= 0 && fileIdx >= 0) {
      expect(folderIdx).toBeLessThan(fileIdx);
    }
  });

  it('should detect languages by extension', () => {
    expect(VirtualFS.detectLanguage('index.html')).toBe('html');
    expect(VirtualFS.detectLanguage('style.css')).toBe('css');
    expect(VirtualFS.detectLanguage('app.js')).toBe('javascript');
    expect(VirtualFS.detectLanguage('index.ts')).toBe('typescript');
    expect(VirtualFS.detectLanguage('data.json')).toBe('json');
    expect(VirtualFS.detectLanguage('readme.md')).toBe('markdown');
    expect(VirtualFS.detectLanguage('unknown.xyz')).toBe('text');
  });

  it('should export and import projects', () => {
    const id = VirtualFS.createProject('Export Test', 'landing-page');
    const exported = VirtualFS.exportProject(id);
    expect(exported.name).toBe('Export Test');
    expect(exported.files['index.html']).toBeDefined();

    const newId = VirtualFS.importProject(exported);
    expect(newId).toMatch(/^proj_/);
    expect(newId).not.toBe(id);
    expect(VirtualFS.getFile(newId, 'index.html')).toBe(exported.files['index.html']);
  });

  it('should return null for nonexistent files', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    expect(VirtualFS.getFile(id, 'nope.txt')).toBeNull();
  });

  it('should return null for nonexistent projects', () => {
    expect(VirtualFS.getProject('proj_nonexistent')).toBeNull();
    expect(VirtualFS.getFile('proj_nonexistent', 'file.txt')).toBeNull();
  });

  it('should return empty array for nonexistent project files', () => {
    expect(VirtualFS.listFiles('proj_nonexistent')).toEqual([]);
  });

  it('should not delete nonexistent files', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    expect(VirtualFS.deleteFile(id, 'nope.txt')).toBe(false);
  });

  it('should not rename nonexistent files', () => {
    const id = VirtualFS.createProject('Test', 'blank');
    expect(VirtualFS.renameFile(id, 'nope.txt', 'new.txt')).toBe(false);
  });
});
