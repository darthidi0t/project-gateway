// Azure Static Web App for the A2A Gateway Console (front end + managed Functions API).
// Deploy:  az deployment group create -g <rg> -f infra/main.bicep -p name=<app-name>

@description('Name of the Static Web App (globally unique within your subscription).')
param name string = 'a2a-gateway-console'

@description('Region for the Static Web App resource. Static Web Apps is offered in a limited set of regions.')
@allowed([
  'centralus'
  'eastus2'
  'westus2'
  'westeurope'
  'eastasia'
])
param location string = 'eastasia'

@description('Free is fine for demos. Standard adds custom auth providers, private endpoints and an SLA.')
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

@description('Public host name shown in rewritten Agent Card URLs.')
param gatewayPublicHost string = 'a2a.gateway.example.com'

param tags object = {
  app: 'a2a-gateway-console'
}

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    // Deployed by GitHub Actions or the SWA CLI using the deployment token,
    // so no repository link is configured here.
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

resource appSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    GATEWAY_PUBLIC_HOST: gatewayPublicHost
  }
}

output name string = swa.name
output url string = 'https://${swa.properties.defaultHostname}'
