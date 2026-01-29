# MoltBot App Service Runtime

🤖 **MoltBot runtime optimized for Azure App Service deployment**

This repository contains the Node.js runtime that powers MoltBot employee agents on Azure App Service, providing a cost-effective PaaS alternative to VM-based deployments.

## Features

- **Cost Effective**: ~$13/month total for multiple agents (vs $20+ per VM)
- **Quick Deploy**: Deploy in minutes, not hours
- **Auto-scaling**: Handles traffic spikes automatically
- **Managed Platform**: No server maintenance required
- **Skills Sync**: Automatic synchronization from private GitHub repositories

## How It Works

```
Azure App Service → Node.js Runtime → MoltBot Gateway → WhatsApp
                          ↓
                   Skills Auto-Sync (15min)
                          ↓
                 Azure Key Vault (Secrets)
```

Each App Service instance:
- Runs Node.js server that manages MoltBot lifecycle
- Automatically installs and configures MoltBot Gateway
- Syncs skills from your private GitHub repository
- Handles WhatsApp webhook endpoints
- Provides health monitoring and management APIs

## Environment Configuration

The runtime uses these environment variables (set via App Service configuration):

### Required
- `AGENT_ID`: Agent identifier (e.g., "employee-2")
- `KEY_VAULT_NAME`: Azure Key Vault name for secrets
- `WHATSAPP_API_KEY`: WhatsApp Business API key (from Key Vault)
- `WHATSAPP_WEBHOOK_SECRET`: Webhook verification token (from Key Vault)
- `ANTHROPIC_API_KEY`: Anthropic API key for Claude (from Key Vault)
- `GITHUB_TOKEN`: GitHub token for skills repository (from Key Vault)
- `SKILLS_REPO_URL`: Private GitHub repository with skills

### Optional
- `SKILLS_SYNC_ENABLED`: Enable/disable skills sync (default: true)
- `SKILLS_SYNC_INTERVAL`: Sync interval in milliseconds (default: 900000 = 15min)
- `PORT`: App Service port (auto-set by Azure)

## API Endpoints

### Health & Status
- `GET /` - Basic agent status
- `GET /health` - Detailed health check with system info

### Management
- `POST /restart` - Restart MoltBot process
- `POST /sync-skills` - Force skills synchronization

### WhatsApp
- `POST /webhook/whatsapp` - WhatsApp webhook endpoint

## Skills Integration

The runtime automatically:
1. **Clones** your private skills repository using GitHub token
2. **Syncs** skills to `/home/site/wwwroot/workspace/skills/`
3. **Reloads** MoltBot after each sync
4. **Schedules** periodic sync every 15 minutes

Your existing skills from `.github-private/skills/` work seamlessly.

## Deployment via Terraform

This runtime is automatically deployed when you use the MoltBot Employee IAC:

```bash
# In moltbot-employee-iac repository
./scripts/deploy.sh terraform
```

The Terraform configuration:
- Creates App Service Plan and Web Apps
- Configures environment variables
- Sets up Key Vault integration
- Deploys this runtime from GitHub

## Manual Deployment

For direct deployment to existing App Service:

```bash
# Configure deployment source
az webapp deployment source config \
  --name your-app-service-name \
  --resource-group your-rg \
  --repo-url https://github.com/ashikaiapps/moltbot-appservice-runtime \
  --branch main \
  --manual-integration

# Configure app settings
az webapp config appsettings set \
  --name your-app-service-name \
  --resource-group your-rg \
  --settings AGENT_ID=employee-2 KEY_VAULT_NAME=your-kv
```

## Cost Comparison

**App Service vs VM deployment:**

| Resource | VM (per agent) | App Service (shared) |
|----------|---------------|---------------------|
| Compute | Standard_B1s ~$15/month | B1 Plan ~$13/month total |
| Storage | ~$2/month each | Included |
| Network | ~$1-3/month each | Included |
| Management | Manual updates/patches | Managed platform |
| **Total for 2 agents** | **~$36-40/month** | **~$13-15/month** |

**Savings: ~60-70% cost reduction with App Service!**

## Architecture Benefits

### PaaS Advantages
- **No VM management**: OS updates, security patches handled by Azure
- **Auto-scaling**: Scale up/down based on demand
- **Built-in monitoring**: Application Insights integration
- **Deployment slots**: Blue/green deployments supported
- **Custom domains**: SSL certificates managed by Azure

### MoltBot Integration  
- **Same capabilities**: Full MoltBot feature set preserved
- **Skills compatibility**: Existing skills work without changes
- **Independent agents**: Each App Service runs isolated agent
- **WhatsApp ready**: Webhook endpoints configured automatically

## Troubleshooting

### Check App Service logs
```bash
az webapp log tail --name your-app-service --resource-group your-rg
```

### Common issues

**Skills not syncing:**
- Verify GitHub token has repo access
- Check Key Vault permissions for App Service managed identity
- Review App Service logs for sync errors

**MoltBot not starting:**
- Check Anthropic API key configuration
- Verify App Service has sufficient memory (B1 recommended minimum)
- Review startup logs in Azure portal

**WhatsApp webhook issues:**
- Ensure webhook URL points to App Service: `https://your-app.azurewebsites.net/webhook/whatsapp`
- Verify webhook secret matches Key Vault value
- Check WhatsApp Business API configuration

## Development

To run locally for development:

```bash
# Install dependencies
npm install

# Set environment variables
export AGENT_ID=employee-test
export SKILLS_SYNC_ENABLED=true
# ... other required env vars

# Start development server
npm run dev
```

## Production Considerations

### Security
- All secrets stored in Azure Key Vault
- App Service managed identity for authentication
- HTTPS enforced for all endpoints
- Network restrictions via App Service networking

### Monitoring
- Application Insights for performance monitoring
- Custom health check endpoints
- Automated restart on failures
- Skills sync status tracking

### Scaling
- App Service Plan shared across all agents
- Scale up plan as agents are added
- Consider P-series plans for production workloads
- Monitor CPU/memory usage via Azure Portal

---

🚀 **Ready to deploy cost-effective MoltBot employees? Use the Terraform IAC to get started!**