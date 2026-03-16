/**
 * Weather Mock Plugin - Tests complex parameters, multiple tools, exports API
 *
 * Tests: complex tool params (enums, numbers), inter-plugin exports, storage alerts
 */

// Deterministic mock weather based on city name hash
function hashCity(city) {
  let hash = 0;
  for (let i = 0; i < city.length; i++) {
    hash = ((hash << 5) - hash) + city.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateWeather(city) {
  const h = hashCity(city.toLowerCase());
  const dayOfYear = Math.floor(Date.now() / 86400000) % 365;

  const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Windy', 'Stormy', 'Snowy', 'Foggy'];
  const condition = conditions[(h + dayOfYear) % conditions.length];

  // Temperature varies by "latitude" (hash-based) and season
  const baseTemp = 10 + (h % 25);
  const seasonalOffset = Math.sin((dayOfYear / 365) * Math.PI * 2) * 10;
  const temp = Math.round(baseTemp + seasonalOffset + (h % 5) - 2);

  return {
    city,
    temperature: temp,
    humidity: 30 + (h % 50),
    windSpeed: 5 + (h % 30),
    condition,
    feelsLike: temp - Math.round((h % 5) - 2),
    uvIndex: Math.min(11, Math.max(1, Math.round(temp / 3))),
    timestamp: new Date().toISOString()
  };
}

function toFahrenheit(celsius) {
  return Math.round(celsius * 9 / 5 + 32);
}

export async function activate(ctx) {
  ctx.log.info('Weather Mock plugin activating...');

  // Export weather API for other plugins to use
  ctx.exports({
    getWeather: (city) => generateWeather(city),
    getVersion: () => '1.0.0'
  });

  // Register /weather command
  ctx.commands.registerCommand('/weather', async (args) => {
    const city = args.join(' ');
    if (!city) {
      return {
        type: 'builtin',
        command: '/weather',
        error: 'Usage: /weather <city name>'
      };
    }

    const weather = generateWeather(city);
    return {
      type: 'builtin',
      command: '/weather',
      data: {
        message: `${weather.city}: ${weather.temperature}°C, ${weather.condition}`,
        ...weather
      }
    };
  });

  // Register get_weather tool
  ctx.tools.registerTool({
    id: 'get_weather',
    name: 'get_weather',
    description: 'Get current weather conditions for a city. Returns temperature, humidity, wind speed, and conditions. This is mock data for testing.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature units' }
      },
      required: ['city']
    },
    handler: async (args) => {
      const weather = generateWeather(String(args.city));

      if (args.units === 'fahrenheit') {
        weather.temperature = toFahrenheit(weather.temperature);
        weather.feelsLike = toFahrenheit(weather.feelsLike);
      }

      // Check alerts
      const alerts = await ctx.storage.get('alerts') || [];
      const triggered = alerts.filter(a =>
        a.city.toLowerCase() === weather.city.toLowerCase() &&
        ((a.condition === 'above' && weather.temperature > a.threshold) ||
         (a.condition === 'below' && weather.temperature < a.threshold))
      );

      return JSON.stringify({
        ...weather,
        units: args.units || 'celsius',
        triggeredAlerts: triggered.length > 0 ? triggered : undefined
      });
    }
  });

  // Register get_forecast tool
  ctx.tools.registerTool({
    id: 'get_forecast',
    name: 'get_forecast',
    description: 'Get a multi-day weather forecast for a city. Mock data for testing.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        days: { type: 'number', description: 'Number of days (1-7, default 3)' }
      },
      required: ['city']
    },
    handler: async (args) => {
      const city = String(args.city);
      const days = Math.min(7, Math.max(1, Number(args.days) || 3));
      const forecast = [];

      for (let i = 0; i < days; i++) {
        const weather = generateWeather(city);
        // Vary temperature by day offset
        const offset = (i * 3 - days) + (hashCity(city + i) % 5);
        const date = new Date();
        date.setDate(date.getDate() + i);

        forecast.push({
          date: date.toISOString().split('T')[0],
          high: weather.temperature + Math.abs(offset),
          low: weather.temperature - Math.abs(offset) - 3,
          condition: weather.condition,
          humidity: weather.humidity
        });
      }

      return JSON.stringify({
        city,
        days,
        forecast
      });
    }
  });

  // Register set_weather_alert tool
  ctx.tools.registerTool({
    id: 'set_weather_alert',
    name: 'set_weather_alert',
    description: 'Set a weather alert for a city when temperature crosses a threshold.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City to monitor' },
        condition: { type: 'string', enum: ['above', 'below'], description: 'above or below' },
        threshold: { type: 'number', description: 'Temperature threshold (celsius)' }
      },
      required: ['city', 'condition', 'threshold']
    },
    handler: async (args) => {
      const alerts = (await ctx.storage.get('alerts')) || [];
      const alert = {
        id: `alert_${Date.now()}`,
        city: String(args.city),
        condition: String(args.condition),
        threshold: Number(args.threshold),
        createdAt: new Date().toISOString()
      };
      alerts.push(alert);
      await ctx.storage.set('alerts', alerts);

      return JSON.stringify({
        success: true,
        alertId: alert.id,
        message: `Alert set: notify when ${alert.city} temperature is ${alert.condition} ${alert.threshold}°C`,
        totalAlerts: alerts.length
      });
    }
  });

  ctx.log.info('Weather Mock plugin activated successfully');
}

export function deactivate() {
  console.log('[Weather Mock Plugin] Deactivated');
}
