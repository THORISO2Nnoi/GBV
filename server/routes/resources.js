const express = require('express');
const router = express.Router();

// Get resources
router.get('/', async (req, res) => {
  try {
    const resources = {
      emergencyNumbers: [
        { name: 'Police Emergency', number: '911', type: 'emergency', description: 'Immediate police response' },
        { name: 'GBV Helpline', number: '0800 428 428', type: 'support', description: '24/7 GBV support and counseling' },
        { name: 'Ambulance', number: '112', type: 'emergency', description: 'Medical emergency services' },
        { name: 'Lifeline Counseling', number: '0861 322 322', type: 'support', description: 'Crisis support and suicide prevention' }
      ],
      shelters: [
        { name: 'Safe House Central', address: '123 Safety Street, City', phone: '555-0101', capacity: 20, services: ['Emergency shelter', 'Counseling', 'Legal aid'] },
        { name: 'Women\'s Shelter', address: '456 Protection Ave, City', phone: '555-0102', capacity: 15, services: ['Temporary housing', 'Support groups', 'Job training'] }
      ],
      legalAid: [
        { name: 'Legal Aid Society', service: 'Protection Orders', phone: '555-0201', free: true, description: 'Free legal assistance for protection orders' },
        { name: 'Victim Advocacy', service: 'Court Support', phone: '555-0202', free: true, description: 'Court accompaniment and victim advocacy' }
      ]
    };

    res.json(resources);
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({ message: 'Server error fetching resources' });
  }
});

module.exports = router;