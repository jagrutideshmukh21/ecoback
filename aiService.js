const axios = require('axios');

/**
 * Service to handle AI interaction (Gemini / OpenAI).
 * If API keys are missing, it uses a detailed sustainability simulator to provide rich, context-aware suggestions.
 */
class AIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    this.provider = process.env.GEMINI_API_KEY ? 'gemini' : (process.env.OPENAI_API_KEY ? 'openai' : 'simulator');
    console.log(`🤖 [AI Service] Initialized. Provider: ${this.provider.toUpperCase()}`);
  }

  /**
   * Generates a sustainability report and roadmap based on calculator values.
   */
  async generateReport(inputs) {
    const { transportation, energy, food, shopping, water, waste } = inputs;
    
    // Physical carbon calculation logic (as baseline fallback and verification)
    const emissions = this.calculateEmissions(inputs);
    
    if (this.provider === 'simulator') {
      return this.simulateReport(inputs, emissions);
    }

    try {
      const prompt = `
        You are an expert AI sustainability coach. Analyze this carbon footprint data for a user:
        - Transportation habits: ${JSON.stringify(transportation)}
        - Electricity/Energy usage: ${JSON.stringify(energy)}
        - Food preferences: ${JSON.stringify(food)}
        - Shopping habits: ${JSON.stringify(shopping)}
        - Water usage: ${JSON.stringify(water)}
        - Waste generation: ${JSON.stringify(waste)}
        
        Calculated monthly CO2 emissions are:
        - Transportation: ${emissions.transportation.toFixed(1)} kg
        - Energy: ${emissions.energy.toFixed(1)} kg
        - Food: ${emissions.food.toFixed(1)} kg
        - Waste: ${emissions.waste.toFixed(1)} kg
        - Water: ${emissions.water.toFixed(1)} kg
        - Shopping: ${emissions.shopping.toFixed(1)} kg
        - Total: ${emissions.total.toFixed(1)} kg CO2

        Please generate a professional, inspiring, and detailed AI sustainability report.
        Return a JSON object containing exactly the following keys (do not include markdown wrapping, return raw JSON string only):
        {
          "summary": "A 3-sentence summary of their footprint, explaining where their impact is largest and how it compares to national averages.",
          "roadmap": [
            { "milestone": "Short-term (Week 1-4)", "actions": ["action 1", "action 2"], "impact": "Expected reduction in CO2 (e.g. 15kg CO2 saved)" },
            { "milestone": "Medium-term (Month 2-6)", "actions": ["action 1", "action 2"], "impact": "Expected reduction in CO2" },
            { "milestone": "Long-term (Year 1+)", "actions": ["action 1", "action 2"], "impact": "Expected reduction in CO2" }
          ],
          "suggestions": [
            "Specific, personalized suggestions for reduction based on their values."
          ],
          "trends": {
            "prediction": "AI narrative predicting their carbon reduction trajectory over the next 12 months if recommendations are followed.",
            "projectedReductionPercentage": 25
          }
        }
      `;

      let responseText = "";
      if (this.provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
        const res = await axios.post(url, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        });
        responseText = res.data.candidates[0].content.parts[0].text;
      } else { // openai
        const res = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: "json_object" }
        }, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });
        responseText = res.data.choices[0].message.content;
      }

      return JSON.parse(responseText);
    } catch (err) {
      console.warn("⚠️ AI API call failed or timed out. Falling back to local AI simulator:", err.message);
      return this.simulateReport(inputs, emissions);
    }
  }

  /**
   * Responds to user messages in the sustainability chat assistant.
   */
  async chat(messages, userContext = {}) {
    const lastMessage = messages[messages.length - 1].content;

    if (this.provider === 'simulator') {
      return this.simulateChat(lastMessage, userContext);
    }

    try {
      const prompt = `
        You are EcoBuddy, an advanced AI environmental assistant. You help users reduce their carbon footprints, adopt green habits, and understand environmental concepts.
        User profile context:
        - Level: ${userContext.level || 1}
        - Current Carbon Score: ${userContext.carbonScore || 70}/100
        - Unlocked Badges: ${JSON.stringify(userContext.badges || [])}
        
        Recent chat history:
        ${JSON.stringify(messages.slice(-5))}

        Respond to the user's latest query: "${lastMessage}"
        Be helpful, concise, motivational, and suggest specific eco-friendly actions when possible.
      `;

      if (this.provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
        const res = await axios.post(url, {
          contents: [{ parts: [{ text: prompt }] }]
        });
        return res.data.candidates[0].content.parts[0].text;
      } else {
        const res = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }]
        }, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });
        return res.data.choices[0].message.content;
      }
    } catch (err) {
      console.warn("⚠️ AI Chat API call failed. Falling back to local simulator:", err.message);
      return this.simulateChat(lastMessage, userContext);
    }
  }

  /**
   * Internal calculator based on environmental coefficients.
   */
  calculateEmissions(inputs) {
    const { transportation = {}, energy = {}, food = {}, shopping = {}, water = {}, waste = {} } = inputs;
    
    // 1. Transportation
    // Car mileage (miles per week) * 0.404 (kg CO2 per mile) * 4.3 (weeks per month)
    const carEmissions = (parseFloat(transportation.carMiles) || 0) * 0.404 * 4.3 * (transportation.carType === 'electric' ? 0.3 : transportation.carType === 'hybrid' ? 0.6 : 1.0);
    // Public transit: flights, buses, trains
    const transitEmissions = ((parseFloat(transportation.publicTransitHours) || 0) * 1.8 * 4.3) + ((parseFloat(transportation.yearlyFlights) || 0) * 220 / 12);
    const transTotal = carEmissions + transitEmissions;

    // 2. Energy
    // Electricity bill ($) * 1.2 kg CO2 per dollar
    // Gas/heating bill ($) * 2.0 kg CO2 per dollar
    // Clean energy factor discount
    const electricityBase = (parseFloat(energy.electricityBill) || 0) * 1.2;
    const gasBase = (parseFloat(energy.gasBill) || 0) * 2.0;
    const energyDiscount = energy.renewableSource ? 0.2 : 1.0;
    const energyTotal = (electricityBase + gasBase) * energyDiscount;

    // 3. Food
    // Diet coefficients: meat-heavy = 150kg, balanced = 90kg, vegetarian = 45kg, vegan = 25kg
    let foodTotal = 90;
    if (food.dietType === 'vegan') foodTotal = 25;
    else if (food.dietType === 'vegetarian') foodTotal = 45;
    else if (food.dietType === 'meat-heavy') foodTotal = 150;
    
    // Add waste/organic discount
    if (food.organicLocal === 'always') foodTotal *= 0.85;
    
    // 4. Shopping
    // Shopping habits: high = 100kg, average = 50kg, low/sustainable = 15kg
    let shoppingTotal = 50;
    if (shopping.frequency === 'high') shoppingTotal = 120;
    else if (shopping.frequency === 'low' || shopping.secondHand === 'always') shoppingTotal = 20;

    // 5. Water
    // Shower length (minutes) * 0.15kg CO2 * 30 days
    const waterTotal = (parseFloat(water.showerTime) || 8) * 0.15 * 30 * (water.waterSavingFixtures ? 0.7 : 1.0);

    // 6. Waste
    // Recycling rate reduces base waste index
    let wasteTotal = 40;
    if (waste.recyclePlastic && waste.recyclePaper && waste.recycleMetal) wasteTotal = 15;
    else if (waste.recyclePlastic || waste.recyclePaper) wasteTotal = 28;
    if (waste.compost) wasteTotal *= 0.8;

    const total = transTotal + energyTotal + foodTotal + shoppingTotal + waterTotal + wasteTotal;

    return {
      transportation: transTotal,
      energy: energyTotal,
      food: foodTotal,
      shopping: shoppingTotal,
      water: waterTotal,
      waste: wasteTotal,
      total
    };
  }

  /**
   * Formulates a mock report in strict alignment with input data when keys are absent.
   */
  simulateReport(inputs, emissions) {
    const { transportation = {}, energy = {}, food = {}, shopping = {} } = inputs;
    
    let summary = `Your monthly carbon footprint is estimated at ${emissions.total.toFixed(0)} kg CO2. `;
    let suggestions = [];
    let roadmap = [];
    
    if (emissions.transportation > emissions.energy && emissions.transportation > emissions.food) {
      summary += `Your primary driver of emissions is transportation, accounting for ${((emissions.transportation / emissions.total) * 100).toFixed(0)}% of your total. `;
      suggestions.push("Consider transitioning short commute car trips to cycling or walking.");
      suggestions.push("Explore public transport route options to decrease single-occupant car mileage.");
      
      roadmap.push({
        milestone: "Short-term (Week 1-4)",
        actions: ["Substitute 2 weekly car commutes with cycling or busing", "Combine errands into a single trip"],
        impact: `Reduces transport emissions by ${((emissions.transportation * 0.15)).toFixed(0)} kg CO2`
      });
      roadmap.push({
        milestone: "Medium-term (Month 2-6)",
        actions: ["Set up a carpool group with coworkers", "Check public transit routes for routine weekend trips"],
        impact: `Reduces transport emissions by ${((emissions.transportation * 0.35)).toFixed(0)} kg CO2`
      });
    } else if (emissions.energy > emissions.food) {
      summary += `Your home utility consumption (heating & electricity) represents your largest footprint source, contributing ${((emissions.energy / emissions.total) * 100).toFixed(0)}%. `;
      suggestions.push("Upgrade standard lightbulbs to ENERGY STAR certified LEDs.");
      suggestions.push("Install a smart thermostat to regulate home temperature efficiently.");
      
      roadmap.push({
        milestone: "Short-term (Week 1-4)",
        actions: ["Lower hot water heater temperature to 120°F", "Swap 5 high-use incandescent bulbs for LEDs"],
        impact: `Saves ${((emissions.energy * 0.10)).toFixed(0)} kg CO2`
      });
      roadmap.push({
        milestone: "Medium-term (Month 2-6)",
        actions: ["Perform a DIY home energy audit for drafts", "Request clean/renewable source matching from energy supplier"],
        impact: `Saves ${((emissions.energy * 0.40)).toFixed(0)} kg CO2`
      });
    } else {
      summary += `Your food preferences and diet represent your largest single emissions category at ${((emissions.food / emissions.total) * 100).toFixed(0)}%. `;
      suggestions.push("Incorporate more plant-based ingredients and reduce weekly meat consumption.");
      suggestions.push("Minimize waste by planning meals ahead and composting organic leftovers.");
      
      roadmap.push({
        milestone: "Short-term (Week 1-4)",
        actions: ["Adopt 'Meatless Mondays'", "Shop at local farmers markets for seasonal, low-mile food"],
        impact: `Saves ${((emissions.food * 0.20)).toFixed(0)} kg CO2`
      });
      roadmap.push({
        milestone: "Medium-term (Month 2-6)",
        actions: ["Establish a small home herb garden or compost bin", "Commit to zero-food-waste meal preparation"],
        impact: `Saves ${((emissions.food * 0.40)).toFixed(0)} kg CO2`
      });
    }

    if (roadmap.length < 2) {
      roadmap.push({
        milestone: "Short-term (Week 1-4)",
        actions: ["Initiate waste sorting & recycling program", "Use reusable shopping bags & containers"],
        impact: "Saves 10 kg CO2"
      });
      roadmap.push({
        milestone: "Medium-term (Month 2-6)",
        actions: ["Perform home water leakage test", "Adopt smart power strips to cut standby power"],
        impact: "Saves 25 kg CO2"
      });
    }

    roadmap.push({
      milestone: "Long-term (Year 1+)",
      actions: ["Evaluate installing solar panels or heat pumps", "Transition to an EV or hybrid vehicle for commutes"],
      impact: `Aims to slash carbon output by ${((emissions.total * 0.50)).toFixed(0)} kg CO2 annually`
    });

    if (suggestions.length < 3) {
      suggestions.push("Buy clothing items second-hand or choose sustainable, durable brands.");
      suggestions.push("Unplug chargers and appliances to eliminate 'vampire load' when idle.");
      suggestions.push("Implement low-flow aerators on bathroom sinks and showerheads.");
    }

    summary += "Overall, your footprint is lower than the US average monthly footprint of ~1,300 kg CO2, but higher than the global target of ~160 kg CO2 per person. Keep tracking to shrink it!";

    return {
      summary,
      roadmap,
      suggestions,
      trends: {
        prediction: `Following our roadmap will result in an active 25% reduction in footprint over the next 6 months, mostly due to target changes in ${emissions.transportation > emissions.energy ? 'transportation transit' : 'household energy consumption'}.`,
        projectedReductionPercentage: 25
      }
    };
  }

  /**
   * Simulates active conversation responses with key-matching.
   */
  simulateChat(message, userContext) {
    const text = message.toLowerCase();
    
    if (text.includes("transport") || text.includes("car") || text.includes("drive") || text.includes("flight") || text.includes("bus")) {
      return `🚲 **EcoBuddy Transport Advice:**
      Transportation is one of the quickest areas to make an impact! 
      
      *Here are 3 rapid-fire tips:*
      1. **Bicycle Commuting:** For trips under 3 miles, riding a bike is 100% emission-free and keeps you active.
      2. **Eco-Driving:** If you must drive, avoid rapid acceleration. Smooth driving can boost fuel efficiency by up to 30%.
      3. **Train over Plane:** Short flights have massive emissions. Take electric trains for regional travel—it saves over 85% of the carbon per passenger-mile!
      
      Do you currently commute by car, or do you have public transit options near you?`;
    }

    if (text.includes("eat") || text.includes("food") || text.includes("meat") || text.includes("diet") || text.includes("vegan") || text.includes("veg")) {
      return `🥗 **EcoBuddy Diet Advice:**
      What we eat is incredibly influential. Agricultural production is responsible for ~26% of global greenhouse gases!
      
      *Try these changes:*
      * **Swap Red Meat for Beans/Legumes:** Beef produces roughly 60kg of CO2 per kg of food, whereas peas produce less than 1kg!
      * **Eat Seasonally:** Avoid foods shipped via airplanes. Local squash in winter and tomatoes in summer have much lower food miles.
      * **Compost Food Scraps:** When food goes to a landfill, it decomposes anaerobically and produces methane (which is 28x more potent than CO2). Composting keeps it aerobic!
      
      Would you be open to attempting a 'Meatless Day' challenge this week? It rewards 150 XP!`;
    }

    if (text.includes("energy") || text.includes("electricity") || text.includes("power") || text.includes("solar") || text.includes("bulb") || text.includes("light")) {
      return `⚡ **EcoBuddy Energy Tips:**
      Let's optimize your home energy! A few smart adjustments can make a big dent in your monthly utility bills.
      
      *Quick wins:*
      * **Eliminate Standby Loads:** TV boxes, gaming systems, and computer setups consume power even when turned off. Use smart power strips.
      * **Dial Back Thermostats:** Shifting your thermostat 2°F lower in winter (or 2°F higher in summer) saves up to 10% on heating/cooling costs.
      * **Switch to LEDs:** LED bulbs use 75% less energy and last 25 times longer than old incandescent bulbs.
      
      Have you checked if your local utility company offers a 'Green Tariff' to source your power from solar or wind?`;
    }

    if (text.includes("offset") || text.includes("marketplace") || text.includes("tree") || text.includes("credits")) {
      return `🌳 **EcoBuddy Carbon Offsets:**
      Carbon offsets let you fund projects that absorb carbon (like planting trees) or prevent carbon from entering the air (like building wind turbines).
      
      *Keep in mind:*
      1. **Reduction first:** Always prioritize reducing your actual emissions before purchasing offsets.
      2. **XP Marketplace:** In EcoTrack AI, you can buy offsets (like Amazon rainforest protection or clean stove installations) using the XP points you earn from completing daily missions! 
      
      Check out our **Marketplace** page in the sidebar to review available projects!`;
    }

    if (text.includes("qr") || text.includes("reward") || text.includes("badge") || text.includes("xp") || text.includes("points")) {
      return `🏆 **EcoBuddy Rewards & Gamification:**
      EcoTrack AI rewards your real-world sustainability actions!
      
      *Here is how it works:*
      * **XP and Levels:** Complete daily challenges (like walking or unplugging devices) to earn XP. As XP builds, you level up!
      * **Badges:** Unlock unique achievements like "Eco Starter" or "Transit Hero".
      * **QR Code Scanner:** Find EcoTrack QR codes on public transit, reusable cup stations, or recycling bins. Enter the code in the **Challenges** page to claim instant XP rewards!
      
      Check your active streak on the **Dashboard** to maintain your XP multipliers!`;
    }

    if (text.includes("weather") || text.includes("suggest") || text.includes("today")) {
      return `☀️ **Weather-based Eco Suggestions:**
      Based on local temperate weather reports:
      * **Sunny Days:** It's perfect for hang-drying your laundry! Dryers are massive energy hogs (using ~3,000 watts per load). Hang drying saves 100% of that energy.
      * **Moderate Temperature:** Turn off home heating/AC and open windows for natural cross-ventilation. 
      * **Light Rain:** Great for collecting rainwater for garden watering!
      
      Enjoy the day and make it a sustainable one!`;
    }

    // Default chat responder
    return `🌱 **Hi there! I'm EcoBuddy, your AI Sustainability Coach.**
    I'm here to support your green journey. You can ask me questions about:
    * **Reducing car mileage** and optimizing routes
    * **Transitioning to plant-based diets** or seasonal food
    * **Cutting home energy usage** and reducing bills
    * **How to earn badges and XP** in EcoTrack AI
    * **Purchasing carbon offsets** using your XP points
    
    What area of your lifestyle would you like to make greener today?`;
  }
}

module.exports = new AIService();
