import edge from 'edge-js';

console.log('Testing edge-js...');

try {
  const testFunc = edge.func({
    source: `
      using System;
      using System.Threading.Tasks;
      
      public class Startup
      {
          public async Task<object> Invoke(dynamic input)
          {
              return new { success = true, message = "Edge-js works!" };
          }
      }
    `
  });
  
  console.log('Edge function created successfully');
  
  const result = await testFunc({});
  console.log('Result:', result);
  
  if (result) {
    console.log('✅ Edge-js is working!');
  } else {
    console.log('❌ Result is undefined');
  }
  
} catch (error) {
  console.error('❌ Edge-js error:', error);
}