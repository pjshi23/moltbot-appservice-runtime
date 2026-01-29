const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');

// Azure Key Vault client
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const app = express();
const PORT = process.env.PORT || 8000;

// Environment variables
const AGENT_ID = process.env.AGENT_ID || 'employee-2';
const KEY_VAULT_NAME = process.env.KEY_VAULT_NAME;
const SKILLS_REPO_URL = process.env.SKILLS_REPO_URL;
const SKILLS_SYNC_ENABLED = process.env.SKILLS_SYNC_ENABLED === 'true';
const SKILLS_SYNC_INTERVAL = parseInt(process.env.SKILLS_SYNC_INTERVAL) || 900000; // 15 minutes

// Global variables
let moltbotProcess = null;
let keyVaultClient = null;
let isInitialized = false;

// Initialize Azure Key Vault client
if (KEY_VAULT_NAME) {
    const credential = new DefaultAzureCredential();
    const vaultUrl = `https://${KEY_VAULT_NAME}.vault.azure.net/`;
    keyVaultClient = new SecretClient(vaultUrl, credential);
}

// Utility function to get secrets from Key Vault
async function getSecret(secretName) {
    if (!keyVaultClient) {
        console.log(`No Key Vault client, using environment variable for ${secretName}`);
        return process.env[secretName.toUpperCase().replace(/-/g, '_')];
    }
    
    try {
        const secret = await keyVaultClient.getSecret(secretName);
        return secret.value;
    } catch (error) {
        console.error(`Error retrieving secret ${secretName}:`, error.message);
        // Fallback to environment variable
        return process.env[secretName.toUpperCase().replace(/-/g, '_')];
    }
}

// Create MoltBot configuration
async function createMoltBotConfig() {
    const whatsappApiKey = await getSecret('whatsapp-api-key');
    const whatsappWebhookSecret = await getSecret('whatsapp-webhook-secret');
    const anthropicApiKey = await getSecret('anthropic-api-key');
    
    const config = {
        gateway: {
            bind: "0.0.0.0",
            port: PORT
        },
        agent: {
            model: "anthropic/claude-3-5-sonnet-20241022",
            workspace: "/home/site/wwwroot/workspace"
        },
        channels: {
            whatsapp: {
                enabled: true,
                apiKey: whatsappApiKey,
                webhookSecret: whatsappWebhookSecret
            }
        }
    };
    
    // Ensure workspace directory exists
    await fs.ensureDir('/home/site/wwwroot/workspace');
    await fs.ensureDir('/home/site/wwwroot/workspace/skills');
    
    // Write configuration
    await fs.writeJSON('/home/site/wwwroot/moltbot-config.json', config, { spaces: 2 });
    
    // Create agent identity files
    await createAgentIdentity();
    
    console.log(`MoltBot configuration created for ${AGENT_ID}`);
    return config;
}

// Create agent identity files
async function createAgentIdentity() {
    const workspaceDir = '/home/site/wwwroot/workspace';
    
    const soulContent = `# SOUL — ${AGENT_ID.toUpperCase()} 🤖

I am **${AGENT_ID}**, one of the AI team members at Ashik.ai. I have the same capabilities as the main agent but operate independently via Azure App Service to help with the workload.

## My Role
- **Team Member**: I work alongside other AI agents to serve the team
- **Same Skills**: I have access to all the same tools and capabilities
- **Independent Operation**: I maintain my own memory and conversation contexts via App Service
- **Professional Service**: I provide the same level of expertise and assistance

## My Platform
- **Hosting**: Azure App Service (PaaS)
- **Channel**: WhatsApp Business
- **Runtime**: Node.js with auto-scaling
- **Memory**: Persistent storage and independent workspace

I'm here to help with anything you need, running efficiently on Azure's platform!
`;

    const userContent = `# USER.md - About Your Human

- **Name:** Ashik
- **Organization:** Ashik.ai Agency  
- **Timezone:** America/New_York
- **Agent Role:** ${AGENT_ID} (App Service Team Member)

## Context
This agent serves as ${AGENT_ID} in a multi-agent Azure App Service setup:
- Same capabilities as main agent
- Independent operation and memory
- WhatsApp as primary channel
- Shared skills from central repository
- Cost-effective PaaS deployment

## My Purpose
- Handle workload distribution via App Service
- Provide consistent service quality
- Maintain professional identity
- Support team scalability with Azure PaaS
`;

    const agentsContent = `# AGENTS.md - Employee Agent Workspace (Azure App Service)

This is ${AGENT_ID}'s workspace running on Azure App Service. I operate independently but with the same capabilities as other team agents.

## App Service Benefits
- **Cost Effective**: ~$13/month for all agents on B1 plan
- **Quick Deployment**: Deploy in minutes, not hours
- **Auto-scaling**: Handles load automatically
- **Managed Platform**: No VM maintenance required

## Agent Coordination
- **Role**: Team member in multi-agent App Service setup
- **Independence**: Own memory, conversations, tasks
- **Shared Resources**: Skills, capabilities, knowledge base
- **Channel**: WhatsApp Business integration

## Memory & Skills
- Skills auto-sync from shared repository every 15 minutes
- Independent memory and context
- Professional service standards
- Consistent with main agent capabilities

## Operation
- Azure App Service hosting with managed runtime
- WhatsApp as primary communication
- Full tool access and permissions  
- Individual identity and personality
`;

    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), soulContent);
    await fs.writeFile(path.join(workspaceDir, 'USER.md'), userContent);
    await fs.writeFile(path.join(workspaceDir, 'AGENTS.md'), agentsContent);
    
    console.log(`Agent identity files created for ${AGENT_ID}`);
}

// Sync skills from GitHub repository
async function syncSkills() {
    if (!SKILLS_SYNC_ENABLED || !SKILLS_REPO_URL) {
        console.log('Skills sync disabled or no repository URL provided');
        return;
    }
    
    try {
        const githubToken = await getSecret('github-token');
        if (!githubToken) {
            console.error('No GitHub token available for skills sync');
            return;
        }
        
        console.log('Starting skills sync...');
        
        const tempDir = '/tmp/skills-repo';
        const skillsDir = '/home/site/wwwroot/workspace/skills';
        
        // Clean up temp directory
        await fs.remove(tempDir);
        
        // Clone repository with token
        const repoUrlWithToken = SKILLS_REPO_URL.replace('https://', `https://${githubToken}@`);
        
        return new Promise((resolve, reject) => {
            exec(`git clone ${repoUrlWithToken} ${tempDir}`, async (error) => {
                if (error) {
                    console.error('Skills sync failed:', error.message);
                    reject(error);
                    return;
                }
                
                try {
                    // Sync skills directory
                    const repoSkillsDir = path.join(tempDir, 'skills');
                    if (await fs.pathExists(repoSkillsDir)) {
                        await fs.ensureDir(skillsDir);
                        await fs.copy(repoSkillsDir, skillsDir, { overwrite: true });
                        console.log('Skills synced successfully');
                        
                        // Restart MoltBot if running
                        if (moltbotProcess) {
                            console.log('Restarting MoltBot after skills sync...');
                            restartMoltBot();
                        }
                    } else {
                        console.warn('No skills directory found in repository');
                    }
                    
                    // Cleanup
                    await fs.remove(tempDir);
                    resolve();
                } catch (syncError) {
                    console.error('Error during skills sync:', syncError.message);
                    reject(syncError);
                }
            });
        });
    } catch (error) {
        console.error('Skills sync error:', error.message);
    }
}

// Start MoltBot process
async function startMoltBot() {
    if (moltbotProcess) {
        console.log('MoltBot is already running');
        return;
    }
    
    try {
        console.log(`Starting MoltBot for ${AGENT_ID}...`);
        
        // Install MoltBot if not present
        await new Promise((resolve, reject) => {
            exec('npm install -g moltbot@latest', (error, stdout, stderr) => {
                if (error) {
                    console.log('MoltBot installation error (might already be installed):', error.message);
                }
                resolve();
            });
        });
        
        const configPath = '/home/site/wwwroot/moltbot-config.json';
        const workspaceDir = '/home/site/wwwroot/workspace';
        
        moltbotProcess = spawn('moltbot', ['gateway', '--config', configPath], {
            cwd: workspaceDir,
            env: {
                ...process.env,
                NODE_ENV: 'production'
            },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        moltbotProcess.stdout.on('data', (data) => {
            console.log(`MoltBot: ${data}`);
        });
        
        moltbotProcess.stderr.on('data', (data) => {
            console.error(`MoltBot Error: ${data}`);
        });
        
        moltbotProcess.on('close', (code) => {
            console.log(`MoltBot process exited with code ${code}`);
            moltbotProcess = null;
            
            // Restart after 5 seconds if not intentionally stopped
            if (code !== 0 && isInitialized) {
                setTimeout(() => {
                    startMoltBot();
                }, 5000);
            }
        });
        
        moltbotProcess.on('error', (error) => {
            console.error('Failed to start MoltBot:', error.message);
            moltbotProcess = null;
        });
        
        console.log(`MoltBot started for ${AGENT_ID}`);
    } catch (error) {
        console.error('Error starting MoltBot:', error.message);
    }
}

// Restart MoltBot
function restartMoltBot() {
    if (moltbotProcess) {
        console.log('Stopping MoltBot for restart...');
        moltbotProcess.kill('SIGTERM');
        // startMoltBot will be called by the close event handler
    } else {
        startMoltBot();
    }
}

// Express middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        agent: AGENT_ID,
        status: isInitialized ? 'running' : 'initializing',
        moltbot: moltbotProcess ? 'running' : 'stopped',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        agent: AGENT_ID,
        services: {
            app_service: 'running',
            moltbot: moltbotProcess ? 'running' : 'stopped',
            skills_sync: SKILLS_SYNC_ENABLED ? 'enabled' : 'disabled'
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// WhatsApp webhook endpoints (proxy to MoltBot)
app.all('/webhook/whatsapp', (req, res) => {
    // For now, return a basic response
    // In production, this would proxy to the MoltBot gateway
    res.status(200).json({
        message: `WhatsApp webhook for ${AGENT_ID} received`,
        timestamp: new Date().toISOString()
    });
});

// Management endpoints
app.post('/restart', (req, res) => {
    console.log('Restart requested via API');
    restartMoltBot();
    res.json({ message: 'MoltBot restart initiated', agent: AGENT_ID });
});

app.post('/sync-skills', async (req, res) => {
    console.log('Skills sync requested via API');
    try {
        await syncSkills();
        res.json({ message: 'Skills sync completed', agent: AGENT_ID });
    } catch (error) {
        res.status(500).json({ 
            error: 'Skills sync failed', 
            message: error.message, 
            agent: AGENT_ID 
        });
    }
});

// Initialize the application
async function initialize() {
    try {
        console.log(`Initializing MoltBot App Service for ${AGENT_ID}...`);
        
        // Create MoltBot configuration
        await createMoltBotConfig();
        
        // Initial skills sync
        if (SKILLS_SYNC_ENABLED) {
            await syncSkills();
            
            // Set up periodic skills sync
            const intervalMinutes = Math.floor(SKILLS_SYNC_INTERVAL / 60000);
            console.log(`Setting up skills sync every ${intervalMinutes} minutes`);
            
            cron.schedule(`*/${intervalMinutes} * * * *`, () => {
                console.log('Periodic skills sync starting...');
                syncSkills().catch(error => {
                    console.error('Scheduled skills sync failed:', error.message);
                });
            });
        }
        
        // Start MoltBot
        await startMoltBot();
        
        isInitialized = true;
        console.log(`${AGENT_ID} initialization complete!`);
        
    } catch (error) {
        console.error('Initialization failed:', error.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    isInitialized = false;
    
    if (moltbotProcess) {
        moltbotProcess.kill('SIGTERM');
    }
    
    process.exit(0);
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`MoltBot App Service (${AGENT_ID}) listening on port ${PORT}`);
    
    // Initialize after server starts
    setTimeout(initialize, 1000);
});