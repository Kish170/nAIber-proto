// Simple test script for ElevenLabs webhook
const axios = require('axios');

const BASE_URL = 'https://c24176254ce7.ngrok-free.app/api';

async function testWebhook() {
  console.log('Testing ElevenLabs webhook endpoints...\n');

  try {
    // Test 1: Create User
    console.log('1. Testing create_user...');
    const createUserResponse = await axios.post(`${BASE_URL}/elevenlabs-webhook`, {
      function_name: 'create_user',
      parameters: {
        fullName: 'John Smith'
      },
      conversation_id: 'test_conv_123'
    });
    
    console.log('Create user response:', createUserResponse.data);
    const userId = createUserResponse.data.data.userId;
    
    // Test 2: Save User Data
    console.log('\n2. Testing save_user_data...');
    const saveDataResponse = await axios.post(`${BASE_URL}/elevenlabs-webhook`, {
      function_name: 'save_user_data',
      parameters: {
        field: 'age',
        value: 75,
        userId: userId
      },
      conversation_id: 'test_conv_123'
    });
    
    console.log('Save data response:', saveDataResponse.data);
    
    // Test 3: Check Missing Info
    console.log('\n3. Testing check_missing_info...');
    const checkInfoResponse = await axios.post(`${BASE_URL}/elevenlabs-webhook`, {
      function_name: 'check_missing_info',
      parameters: {
        userId: userId
      },
      conversation_id: 'test_conv_123'
    });
    
    console.log(' Check missing info response:', checkInfoResponse.data);
    
    // Test 4: Create Emergency Contact
    console.log('\n4. Testing create_emergency_contact...');
    const emergencyContactResponse = await axios.post(`${BASE_URL}/elevenlabs-webhook`, {
      function_name: 'create_emergency_contact',
      parameters: {
        name: 'Jane Smith',
        phoneNumber: '+1234567890',
        relationship: 'DAUGHTER',
        userId: userId
      },
      conversation_id: 'test_conv_123'
    });
    
    console.log(' Emergency contact response:', emergencyContactResponse.data);
    
    // Test 5: Add Health Condition
    console.log('\n5. Testing add_health_condition...');
    const healthConditionResponse = await axios.post(`${BASE_URL}/elevenlabs-webhook`, {
      function_name: 'add_health_condition',
      parameters: {
        userId: userId,
        name: 'Diabetes Type 2',
        category: 'CHRONIC',
        severity: 'MODERATE',
        notes: 'Diagnosed 5 years ago, well controlled with medication'
      },
      conversation_id: 'test_conv_123'
    });
    
    console.log(' Health condition response:', healthConditionResponse.data);
    
    // Test 6: Get User Health Conditions
    console.log('\n6. Testing get_user_health_conditions...');
    const getUserHealthConditionsResponse = await axios.post(`${BASE_URL}/elevenlabs-webhook`, {
      function_name: 'get_user_health_conditions',
      parameters: {
        userId: userId
      },
      conversation_id: 'test_conv_123'
    });
    
    console.log(' Get health conditions response:', getUserHealthConditionsResponse.data);
    
    // Test 7: Add Medication
    console.log('\n7. Testing add_medication...');
    const medicationResponse = await axios.post(`${BASE_URL}/elevenlabs-webhook`, {
      function_name: 'add_medication',
      parameters: {
        userId: userId,
        name: 'Metformin',
        category: 'DIABETES',
        dosage: '500mg',
        frequency: 'ONCE_DAILY',
        prescriber: 'Dr. Smith',
        notes: 'Take with food to reduce stomach upset'
      },
      conversation_id: 'test_conv_123'
    });
    
    console.log(' Medication response:', medicationResponse.data);
    
    // Test 8: Get User Medications
    console.log('\n8. Testing get_user_medications...');
    const getUserMedicationsResponse = await axios.post(`${BASE_URL}/elevenlabs-webhook`, {
      function_name: 'get_user_medications',
      parameters: {
        userId: userId
      },
      conversation_id: 'test_conv_123'
    });
    
    console.log(' Get medications response:', getUserMedicationsResponse.data);
    
    console.log('\n All tests passed!');
    
  } catch (error) {
    console.error(' Test failed:', error.response?.data || error.message);
  }
}

// Run tests
testWebhook();
