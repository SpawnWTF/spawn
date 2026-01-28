#!/usr/bin/env node

import chalk from 'chalk';
import { prompt } from 'enquirer';
import fs from 'fs-extra';
import ora from 'ora';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// ============================================================================
// Banner
// ============================================================================

function showBanner() {
  console.log('');
  console.log(chalk.hex('#ff2d92')('  ╔═══════════════════════════════════════╗'));
  console.log(chalk.hex('#ff2d92')('  ║') + chalk.white.bold('          SPAWN.WTF  Setup             ') + chalk.hex('#ff2d92')('║'));
  console.log(chalk.hex('#ff2d92')('  ╚═══════════════════════════════════════╝'));
  console.log('');
}

// ============================================================================
// Commands
// ============================================================================

async function init() {
  showBanner();

  // Detect environment
  const cwd = process.cwd();
  const isInSkillsDir = cwd.endsWith('/skills') || cwd.endsWith('\\skills');
  const hasClawdbot = fs.existsSync(path.join(cwd, '..', 'config.yaml')) || 
                      fs.existsSync(path.join(cwd, '..', '.clawdbot'));

  if (hasClawdbot) {
    console.log(chalk.green('✓') + ' Detected Clawdbot installation\n');
  }

  // Prompt for token
  const { token } = await prompt({
    type: 'password',
    name: 'token',
    message: 'Enter your Spawn token:',
    validate: (value) => {
      if (!value) return 'Token is required';
      if (!value.startsWith('spwn_sk_')) return 'Invalid token format (should start with spwn_sk_)';
      return true;
    }
  });

  // Determine output directory
  let outputDir;
  if (isInSkillsDir) {
    outputDir = path.join(cwd, 'spawn');
  } else {
    const { skillsPath } = await prompt({
      type: 'input',
      name: 'skillsPath',
      message: 'Where is your skills directory?',
      initial: './skills/spawn'
    });
    outputDir = path.resolve(skillsPath);
  }

  // Check if already exists
  if (fs.existsSync(outputDir)) {
    const { overwrite } = await prompt({
      type: 'confirm',
      name: 'overwrite',
      message: `${outputDir} already exists. Overwrite?`,
      initial: false
    });
    if (!overwrite) {
      console.log(chalk.yellow('\nAborted.'));
      process.exit(0);
    }
  }

  // Create skill files
  const spinner = ora('Creating skill files...').start();

  try {
    // Create directory
    await fs.ensureDir(outputDir);
    await fs.ensureDir(path.join(outputDir, 'spawn'));

    // Copy SKILL.md
    const skillTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'SKILL.md'), 'utf-8');
    await fs.writeFile(path.join(outputDir, 'SKILL.md'), skillTemplate);

    // Copy Python SDK
    const sdkTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'spawn', '__init__.py'), 'utf-8');
    await fs.writeFile(path.join(outputDir, 'spawn', '__init__.py'), sdkTemplate);

    spinner.succeed('Created skill files');

    // Add to .env
    const envPath = findEnvFile(outputDir);
    if (envPath) {
      spinner.start('Adding token to .env...');
      await addToEnv(envPath, 'SPAWN_TOKEN', token);
      spinner.succeed(`Added token to ${path.relative(cwd, envPath)}`);
    } else {
      // Create .env in skill directory or parent
      const newEnvPath = path.join(path.dirname(outputDir), '.env');
      spinner.start('Creating .env file...');
      await fs.appendFile(newEnvPath, `\n# Spawn\nSPAWN_TOKEN=${token}\n`);
      spinner.succeed(`Created ${path.relative(cwd, newEnvPath)}`);
    }

    // Success message
    console.log('');
    console.log(chalk.green('✓ Spawn skill installed successfully!'));
    console.log('');
    console.log(chalk.white('  Files created:'));
    console.log(chalk.gray(`    ${path.relative(cwd, outputDir)}/SKILL.md`));
    console.log(chalk.gray(`    ${path.relative(cwd, outputDir)}/spawn/__init__.py`));
    console.log('');

    // Next steps
    console.log(chalk.white.bold('  Next steps:'));
    console.log('');
    
    if (hasClawdbot) {
      console.log(chalk.cyan('  1.') + ' Restart Clawdbot:');
      console.log(chalk.gray('     clawdbot restart'));
      console.log('');
      console.log(chalk.cyan('  2.') + ' Open Spawn app - your agent should appear!');
    } else {
      console.log(chalk.cyan('  1.') + ' Add to your agent code:');
      console.log('');
      console.log(chalk.gray('     import spawn'));
      console.log(chalk.gray('     spawn.init()'));
      console.log(chalk.gray('     await spawn.connect()'));
      console.log('');
      console.log(chalk.cyan('  2.') + ' Restart your agent');
      console.log('');
      console.log(chalk.cyan('  3.') + ' Open Spawn app - your agent should appear!');
    }

    console.log('');
    console.log(chalk.gray('  Docs: https://spawn.io/docs'));
    console.log('');

  } catch (error) {
    spinner.fail('Failed to create skill files');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

async function upgrade() {
  showBanner();

  const spinner = ora('Checking for updates...').start();

  // Find existing installation
  const skillPath = findSkillPath();
  if (!skillPath) {
    spinner.fail('No Spawn skill found in current directory');
    process.exit(1);
  }

  // Get current version
  // (In a real implementation, we'd check version in a config file)

  // Download latest
  spinner.text = 'Downloading latest version...';

  try {
    // Copy new files
    const skillTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'SKILL.md'), 'utf-8');
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), skillTemplate);

    const sdkTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'spawn', '__init__.py'), 'utf-8');
    await fs.writeFile(path.join(skillPath, 'spawn', '__init__.py'), sdkTemplate);

    spinner.succeed('Upgraded to latest version');
    console.log('');
    console.log(chalk.yellow('  Restart your agent to apply changes.'));
    console.log('');

  } catch (error) {
    spinner.fail('Failed to upgrade');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

async function status() {
  showBanner();

  // Check installation
  const skillPath = findSkillPath();
  if (skillPath) {
    console.log(chalk.green('✓') + ` Skill installed at: ${skillPath}`);
  } else {
    console.log(chalk.red('✗') + ' Skill not found');
  }

  // Check token
  const token = process.env.SPAWN_TOKEN || findTokenInEnv();
  if (token) {
    console.log(chalk.green('✓') + ` Token configured: ${token.slice(0, 12)}...`);
  } else {
    console.log(chalk.red('✗') + ' Token not found in environment');
  }

  // Check connection (would need actual API call)
  console.log(chalk.gray('○') + ' Connection: Run your agent to test');

  console.log('');
}

function showHelp() {
  showBanner();

  console.log(chalk.white('  Usage:'));
  console.log(chalk.gray('    npx spawn-skill <command>'));
  console.log('');
  console.log(chalk.white('  Commands:'));
  console.log(chalk.cyan('    init') + '      Set up Spawn skill in your project');
  console.log(chalk.cyan('    upgrade') + '   Update to the latest version');
  console.log(chalk.cyan('    status') + '    Check installation status');
  console.log(chalk.cyan('    help') + '      Show this help message');
  console.log('');
  console.log(chalk.white('  Examples:'));
  console.log(chalk.gray('    cd ~/clawdbot/skills && npx spawn-skill init'));
  console.log(chalk.gray('    npx spawn-skill upgrade'));
  console.log('');
}

// ============================================================================
// Helpers
// ============================================================================

function findEnvFile(startPath) {
  const locations = [
    path.join(startPath, '.env'),
    path.join(path.dirname(startPath), '.env'),
    path.join(path.dirname(path.dirname(startPath)), '.env'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }
  return null;
}

async function addToEnv(envPath, key, value) {
  let content = await fs.readFile(envPath, 'utf-8');
  
  // Check if key already exists
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    // Replace existing
    content = content.replace(regex, `${key}=${value}`);
  } else {
    // Add new
    content += `\n# Spawn\n${key}=${value}\n`;
  }

  await fs.writeFile(envPath, content);
}

function findSkillPath() {
  const locations = [
    './spawn',
    './skills/spawn',
    '../spawn',
  ];

  for (const loc of locations) {
    const fullPath = path.resolve(loc);
    if (fs.existsSync(path.join(fullPath, 'SKILL.md'))) {
      return fullPath;
    }
  }
  return null;
}

function findTokenInEnv() {
  const envPath = findEnvFile(process.cwd());
  if (!envPath) return null;

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/SPAWN_TOKEN=(.+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Main
// ============================================================================

const command = process.argv[2] || 'init';

switch (command) {
  case 'init':
    init();
    break;
  case 'upgrade':
    upgrade();
    break;
  case 'status':
    status();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    console.log(chalk.red(`Unknown command: ${command}`));
    showHelp();
    process.exit(1);
}
