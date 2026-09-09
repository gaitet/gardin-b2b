import crypto from 'crypto';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const api = axios.create({
  baseURL: 'https://api.keepincrm.com/v1',
  headers: {
    'X-Auth-Token': process.env.KEEPIN_API_KEY,
    Accept: 'application/json',
  },
});

app.get('/materials', async (req, res) => {
  try {
    let page = 1;
    const allItems = [];

    while (true) {
      console.log(`Завантажую сторінку ${page}...`);

      const response = await api.get('/materials', {
        params: { page },
      });

      const items = response.data.items || [];

      console.log(`Сторінка ${page}: ${items.length} товарів`);

      if (items.length === 0) {
        break;
      }

      allItems.push(...items);

      if (items.length < 25) {
        break;
      }

      page++;

      if (page > 100) {
        throw new Error('Забагато сторінок — завантаження зупинено');
      }
    }

    console.log(`ВСЬОГО ЗАВАНТАЖЕНО: ${allItems.length} товарів`);

    const materials = allItems.map((item) => ({
      id: item.id,
      article: item.sku,
      name: item.title,
      price: item.price_amount,
      unit: item.unit,
      image: item.asset_url,
      category: item.category?.name ?? '',
      stock: item.stock_available,
    }));

    res.json(materials);
  } catch (error) {
    console.error(
      'Помилка:',
      error.response?.data || error.message
    );

    res.status(500).json({
      error: 'Помилка отримання товарів',
    });
  }
});

app.get('/stages', async (req, res) => {
  try {
    const response = await api.get('/agreements/stages');
    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);

    res.status(500).json({
      error: 'Помилка отримання етапів',
    });
  }
});

app.post('/orders', async (req, res) => {
  try {
    const { dealerName, keepinClientId, items } = req.body;

    const clientResponse = await api.get(`/clients/${keepinClientId}`);
    const client = clientResponse.data;

    const dealerDiscount = Number(client.discount) || 0;

    const agreement = {
      title: `B2B — ${dealerName}`,
      client_id: keepinClientId,
      funnel_id: 1,
      stage_id: 1,
      discount: dealerDiscount,
      discount_kind: 'percent_discount',

      jobs_attributes: items.map((item) => ({
        title: item.name,
        amount: item.quantity,
        price: item.price,

        product_attributes: {
          sku: item.article,
          title: item.name,
          price: item.price,
        },
      })),
    };

    console.log('Створюю угоду...');
    console.log(agreement);

    const response = await api.post('/agreements', agreement);

    console.log('УСПІХ!');
    console.log(response.data);

    res.json(response.data);
  } catch (error) {
    console.error('ПОМИЛКА KEEPIN');

    if (error.response) {
      console.error(error.response.data);
      return res.status(error.response.status).json(error.response.data);
    }

    console.error(error.message);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.get('/client/:id', async (req, res) => {
  try {
    const response = await api.get(`/clients/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);

    res.status(500).json({
      error: 'Не вдалося отримати клієнта',
      details: error.response?.data || error.message,
    });
  }
});

app.get('/agreement/:id', async (req, res) => {
  try {
    const response = await api.get(`/agreements/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);

    res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
});

app.get('/orders', async (req, res) => {
  try {
    const { clientId, page = 1 } = req.query;

    if (!clientId) {
      return res.status(400).json({
        error: 'Не вказано clientId',
      });
    }

    const response = await api.get('/agreements', {
      params: {
        'q[client_id_eq]': clientId,
        page,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error(
      'Помилка отримання замовлень:',
      error.response?.data || error.message
    );

    res.status(500).json({
      error: 'Не вдалося отримати замовлення',
      details: error.response?.data || error.message,
    });
  }
});

/*
  ТЕСТОВИЙ МАРШРУТ.
  Отримує угоди з Keepin без фільтра клієнта.
  Потрібен тільки для перевірки API.
*/
app.get('/test-agreements', async (req, res) => {
  try {
    const response = await api.get('/agreements', {
      params: {
        page: 1,
      },
    });

    console.log('УГОДИ KEEPIN:', response.data);

    res.json(response.data);
  } catch (error) {
    console.error(
      'Помилка отримання угод:',
      error.response?.data || error.message
    );

    res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
});
app.get('/client-by-phone', async (req, res) => {
  try {
    const { phone } = req.query;
    console.log('PHONE:', phone);
    if (!phone) {
      return res.status(400).json({
        error: 'Не вказано номер телефону',
      });
    }

    const response = await api.get('/clients', {
      params: {
       'q[trigram_idx_cont]': phone,
      },
    });

    const clients = response.data.items || [];

    if (clients.length === 0) {
      return res.status(404).json({
        error: 'Клієнта з таким номером не знайдено',
      });
    }

    res.json(clients[0]);
  } catch (error) {
    console.error(
      'Помилка пошуку клієнта:',
      error.response?.data || error.message
    );

    res.status(500).json({
      error: 'Не вдалося знайти клієнта',
      details: error.response?.data || error.message,
    });
  }
});
function validateTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken || !initData) {
    return false;
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');

  if (!receivedHash) {
    return false;
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return calculatedHash === receivedHash;
}
app.get('/client-by-telegram', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const initData = authHeader?.startsWith('tma ')
      ? authHeader.slice(4)
      : null;

    if (!initData) {
      return res.status(400).json({
        error: 'Не передано Telegram initData',
      });
    }

    if (!validateTelegramInitData(initData)) {
      return res.status(401).json({
        error: 'Недійсні дані Telegram',
      });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));

    const telegramId = user.id;

    const response = await api.get('/clients', {
      params: {
        'q[custom_fields_jcont][telegram_id_262]': telegramId,
      },
    });

    const clients = response.data.items || [];

    if (clients.length === 0) {
      return res.status(404).json({
        error: 'Клієнта з таким Telegram ID не знайдено',
      });
    }

    res.json(clients[0]);
  } catch (error) {
    console.error(
      'Помилка пошуку за Telegram ID:',
      error.response?.data || error.message
    );

    res.status(500).json({
      error: 'Не вдалося знайти клієнта',
      details: error.response?.data || error.message,
    });
  }
});

export default app;