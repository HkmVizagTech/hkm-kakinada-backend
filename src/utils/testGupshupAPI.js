const axios = require('axios');

async function simpleWhatsAppTest() {
  console.log(' Simple WhatsApp test by saikiran11461 at 2025-08-25 05:13:45');
  
  try {

    const response = await axios.post(
      'https://api.gupshup.io/sm/api/v1/template/msg',
      {
        channel: 'whatsapp',
        source: '917075176108',
        destination: '918688487669',
        'src.name': 'YouthFest',
        template: JSON.stringify({
          id: '1e5b2dd0-3ee7-4d8d-bd41-9a80073b1399',
          params: ['Testing Certificate Fix']
        })
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'apikey': 'zbut4tsg1ouor2jks4umy1d92salxm38'
        }
      }
    );
    
    console.log('✅ Simple WhatsApp test result:', response.data);
    
    console.log('');
    console.log('📱 MANUAL STEPS FOR WHATSAPP:');
    console.log('1. Open WhatsApp on your phone');
    console.log('2. Add contact: +91 7075176108');
    console.log('3. Send any message like "Hello"');
    console.log('4. This will opt you in automatically');
    console.log('5. Then test certificate again');
    
  } catch (error) {
    console.error('❌ Simple WhatsApp test failed:', error.response?.data || error.message);
  }
}

simpleWhatsAppTest();