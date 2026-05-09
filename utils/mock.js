export const mockConversation = {
  id: 'c1',
  messages: [
    { id: 1, direction: 'in', body: 'Hi, my dog is vomiting' },
    { id: 2, direction: 'out', body: 'Please send a photo and symptoms duration.' }
  ],
  customer: {
    name: 'Jane Doe',
    phone: '+15551234567',
    takeover: false,
    paymentScreenshotUrl: 'https://placehold.co/600x400/png'
  }
};
