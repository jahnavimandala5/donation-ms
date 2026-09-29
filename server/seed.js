/**
 * Seeds the MongoDB database with sample FoodLink data.
 * Runs automatically on server start when the users collection is empty,
 * or manually with: node seed.js --force
 */

const { connect } = require("./db");
const models = require("./models");
const auth = require("./auth");

const HOUR = 3600000;
const DAY = 86400000;
const hoursFromNow = (h) => Date.now() + h * HOUR;
const daysAgo = (d) => Date.now() - d * DAY;

function buildData() {
  const now = Date.now();

  // Demo credentials are hashed at seed time so the database never holds a
  // plaintext password. The known logins stay:
  //   admin@foodlink.app / admin123
  //   <any seeded donor>   / donor123
  //   <any seeded receiver>/ receiver123
  const H = (p) => auth.hashPassword(p);

  const users = [
    { id: "u_admin", role: "admin", name: "Aarav Mehta", email: "admin@foodlink.app", phone: "9000000001", password: H("admin123"), orgName: "FoodLink HQ", city: "Delhi", state: "Delhi", address: "10 Cyber Hub, Gurugram", pincode: "122002", description: "Platform administrator", status: "approved", verified: true, points: 0, badges: [], joinedAt: daysAgo(220), avatar: null },
    { id: "u_d1", role: "donor", name: "Rahul Sharma", email: "rahul@foodlink.app", phone: "9810000011", password: H("donor123"), orgName: "Spice Garden", type: "Restaurant", city: "Delhi", state: "Delhi", address: "21, Hauz Khas Village", pincode: "110016", description: "North Indian family restaurant, 80 seats", status: "approved", verified: true, points: 340, badges: ["bronze", "silver", "gold"], joinedAt: daysAgo(180), avatar: null },
    { id: "u_d2", role: "donor", name: "Priya Verma", email: "priya@foodlink.app", phone: "9810000022", password: H("donor123"), orgName: "Grand Palace Hotel", type: "Hotel", city: "Mumbai", state: "Maharashtra", address: "45, Linking Road, Bandra West", pincode: "400050", description: "Full service hotel with buffet banquets", status: "approved", verified: true, points: 210, badges: ["bronze", "silver"], joinedAt: daysAgo(150), avatar: null },
    { id: "u_d3", role: "donor", name: "Amit Patel", email: "amit@foodlink.app", phone: "9810000033", password: H("donor123"), orgName: "Brew & Beans", type: "Cafe", city: "Bengaluru", state: "Karnataka", address: "88, Indiranagar 100 Ft Road", pincode: "560038", description: "Specialty coffee cafe with bakery section", status: "approved", verified: true, points: 90, badges: ["bronze"], joinedAt: daysAgo(90), avatar: null },
    { id: "u_d4", role: "donor", name: "Sunita Rao", email: "sunita@foodlink.app", phone: "9810000044", password: H("donor123"), orgName: "Sunita Rao", type: "Household", city: "Pune", state: "Maharashtra", address: "33, FC Road, Shivajinagar", pincode: "411005", description: "Home cook, surplus from family functions", status: "approved", verified: true, points: 60, badges: ["bronze"], joinedAt: daysAgo(40), avatar: null },
    { id: "u_d5", role: "donor", name: "Karan Malhotra", email: "karan@foodlink.app", phone: "9810000055", password: H("donor123"), orgName: "Sweet Symphony Bakery", type: "Bakery", city: "Kolkata", state: "West Bengal", address: "12, Park Street", pincode: "700016", description: "Bakery, cakes and breads", status: "pending", verified: false, points: 0, badges: [], joinedAt: daysAgo(2), avatar: null },
    { id: "u_r1", role: "receiver", name: "Neha Gupta", email: "neha@foodlink.app", phone: "9811000011", password: H("receiver123"), orgName: "Feed the Future", type: "NGO", city: "Delhi", state: "Delhi", address: "14, Lajpat Nagar II", pincode: "110024", description: "Community kitchen serving 400 meals a day", status: "approved", verified: true, points: 180, badges: ["bronze", "silver"], joinedAt: daysAgo(170), avatar: null },
    { id: "u_r2", role: "receiver", name: "Fr. Joseph D'Souza", email: "joseph@foodlink.app", phone: "9811000022", password: H("receiver123"), orgName: "Hope Home", type: "Orphanage", city: "Mumbai", state: "Maharashtra", address: "8, Dharavi Main Road", pincode: "400017", description: "Home for 60 children, needs 3 meals daily", status: "approved", verified: true, points: 120, badges: ["bronze", "silver"], joinedAt: daysAgo(160), avatar: null },
    { id: "u_r3", role: "receiver", name: "Meera Iyer", email: "meera@foodlink.app", phone: "9811000033", password: H("receiver123"), orgName: "Snehashray", type: "Old Age Home", city: "Bengaluru", state: "Karnataka", address: "22, Jayanagar 4th Block", pincode: "560011", description: "Shelter for 45 senior citizens", status: "approved", verified: true, points: 90, badges: ["bronze"], joinedAt: daysAgo(120), avatar: null },
    { id: "u_r4", role: "receiver", name: "Asha Deshmukh", email: "asha@foodlink.app", phone: "9811000044", password: H("receiver123"), orgName: "Anna Seva Kitchen", type: "Community Kitchen", city: "Pune", state: "Maharashtra", address: "5, Shivaji Nagar", pincode: "411005", description: "Daily free kitchen for students and workers", status: "pending", verified: false, points: 0, badges: [], joinedAt: daysAgo(1), avatar: null }
  ];

  const donations = [
    { id: "d_1", donorId: "u_d1", foodName: "Veg Biryani with Raita", category: "veg", foodType: "Restaurant", quantity: 6, servings: 30, preparedAt: now - 2 * HOUR, expiresAt: hoursFromNow(4), pickupTime: "6:00 PM - 9:00 PM", address: "21, Hauz Khas Village", city: "Delhi", state: "Delhi", pincode: "110016", phone: "9810000011", description: "Freshly prepared vegetable biryani with curd raita, packed hygienically in food-grade containers.", image: null, status: "available", reservedBy: null, reservedByName: "", views: 42, createdAt: now - 2 * HOUR, updatedAt: now - 2 * HOUR },
    { id: "d_2", donorId: "u_d2", foodName: "Chicken Curry & Rice", category: "nonveg", foodType: "Hotel", quantity: 5, servings: 25, preparedAt: now - 3 * HOUR, expiresAt: hoursFromNow(3), pickupTime: "5:00 PM - 8:00 PM", address: "45, Linking Road, Bandra West", city: "Mumbai", state: "Maharashtra", pincode: "400050", phone: "9810000022", description: "Banquet leftover chicken curry with steamed rice. Sealed and chilled.", image: null, status: "available", reservedBy: null, reservedByName: "", views: 55, createdAt: now - 3 * HOUR, updatedAt: now - 3 * HOUR },
    { id: "d_3", donorId: "u_d3", foodName: "Bakery Pastries & Sandwiches", category: "veg", foodType: "Cafe", quantity: 3, servings: 18, preparedAt: now - 4 * HOUR, expiresAt: hoursFromNow(6), pickupTime: "Anytime today", address: "88, Indiranagar 100 Ft Road", city: "Bengaluru", state: "Karnataka", pincode: "560038", phone: "9810000033", description: "Assorted croissants, puffs and sandwiches from today's counter.", image: null, status: "available", reservedBy: null, reservedByName: "", views: 31, createdAt: now - 4 * HOUR, updatedAt: now - 4 * HOUR },
    { id: "d_4", donorId: "u_d4", foodName: "Home-made Paneer Sabzi", category: "veg", foodType: "Household", quantity: 2, servings: 10, preparedAt: now - 1 * HOUR, expiresAt: hoursFromNow(5), pickupTime: "7:00 PM", address: "33, FC Road, Shivajinagar", city: "Pune", state: "Maharashtra", pincode: "411005", phone: "9810000044", description: "Extra paneer curry from family dinner. Vegetarian, mild spice.", image: null, status: "available", reservedBy: null, reservedByName: "", views: 20, createdAt: now - 1 * HOUR, updatedAt: now - 1 * HOUR },
    { id: "d_5", donorId: "u_d1", foodName: "Dal Makhani & Butter Rotis", category: "veg", foodType: "Restaurant", quantity: 8, servings: 40, preparedAt: now - 5 * HOUR, expiresAt: hoursFromNow(2), pickupTime: "4:00 PM - 7:00 PM", address: "21, Hauz Khas Village", city: "Delhi", state: "Delhi", pincode: "110016", phone: "9810000011", description: "Batch from lunch service. Restaurant grade packaging.", image: null, status: "reserved", reservedBy: "u_r1", reservedByName: "Feed the Future", views: 68, createdAt: now - 5 * HOUR, updatedAt: now - 1 * HOUR },
    { id: "d_6", donorId: "u_d2", foodName: "Wedding Banquet Spread", category: "veg", foodType: "Hotel", quantity: 12, servings: 60, preparedAt: now - 8 * HOUR, expiresAt: hoursFromNow(1), pickupTime: "Immediate pickup", address: "45, Linking Road, Bandra West", city: "Mumbai", state: "Maharashtra", pincode: "400050", phone: "9810000022", description: "Full banquet spread from last night's function - gravies, rice, breads, desserts.", image: null, status: "available", reservedBy: null, reservedByName: "", views: 80, createdAt: now - 8 * HOUR, updatedAt: now - 8 * HOUR },
    { id: "d_7", donorId: "u_d3", foodName: "Cold Coffee & Fruit Snacks", category: "veg", foodType: "Cafe", quantity: 1.5, servings: 12, preparedAt: now - 6 * HOUR, expiresAt: hoursFromNow(8), pickupTime: "Anytime today", address: "88, Indiranagar 100 Ft Road", city: "Bengaluru", state: "Karnataka", pincode: "560038", phone: "9810000033", description: "Packaged cold coffees and fresh fruit cups. Chilled.", image: null, status: "collected", reservedBy: "u_r3", reservedByName: "Snehashray", views: 25, createdAt: now - 6 * HOUR, updatedAt: now - 30 * 60000 },
    { id: "d_8", donorId: "u_d4", foodName: "Homemade Kheer", category: "veg", foodType: "Household", quantity: 1.2, servings: 8, preparedAt: now - 12 * HOUR, expiresAt: hoursFromNow(-2), pickupTime: "Yesterday", address: "33, FC Road, Shivajinagar", city: "Pune", state: "Maharashtra", pincode: "411005", phone: "9810000044", description: "Rice kheer made for a small function.", image: null, status: "expired", reservedBy: null, reservedByName: "", views: 15, createdAt: now - 12 * HOUR, updatedAt: now - 12 * HOUR },
    { id: "d_9", donorId: "u_d1", foodName: "Rajma Chawal Lunch Boxes", category: "veg", foodType: "Restaurant", quantity: 4, servings: 20, preparedAt: daysAgo(1), expiresAt: hoursFromNow(-24), pickupTime: "Completed", address: "21, Hauz Khas Village", city: "Delhi", state: "Delhi", pincode: "110016", phone: "9810000011", description: "Completed donation - 20 lunch boxes served at a night shelter.", image: null, status: "completed", reservedBy: "u_r1", reservedByName: "Feed the Future", views: 40, createdAt: daysAgo(1), updatedAt: daysAgo(1) },
    { id: "d_10", donorId: "u_d2", foodName: "Pasta & Salad Buffet", category: "veg", foodType: "Hotel", quantity: 5, servings: 24, preparedAt: daysAgo(2), expiresAt: hoursFromNow(-48), pickupTime: "Completed", address: "45, Linking Road, Bandra West", city: "Mumbai", state: "Maharashtra", pincode: "400050", phone: "9810000022", description: "Completed donation to Hope Home orphanage.", image: null, status: "completed", reservedBy: "u_r2", reservedByName: "Hope Home", views: 38, createdAt: daysAgo(2), updatedAt: daysAgo(2) },
    { id: "d_11", donorId: "u_d4", foodName: "Festive Sweets Box", category: "veg", foodType: "Household", quantity: 2, servings: 14, preparedAt: now - 2 * HOUR, expiresAt: hoursFromNow(9), pickupTime: "6:30 PM", address: "33, FC Road, Shivajinagar", city: "Pune", state: "Maharashtra", pincode: "411005", phone: "9810000044", description: "Box of assorted mithai from a family celebration. Sealed boxes.", image: null, status: "available", reservedBy: null, reservedByName: "", views: 18, createdAt: now - 2 * HOUR, updatedAt: now - 2 * HOUR },
    { id: "d_12", donorId: "u_d3", foodName: "Mushroom Pizza Slices", category: "veg", foodType: "Cafe", quantity: 3, servings: 16, preparedAt: now - 3 * HOUR, expiresAt: hoursFromNow(2), pickupTime: "5:30 PM - 8:00 PM", address: "88, Indiranagar 100 Ft Road", city: "Bengaluru", state: "Karnataka", pincode: "560038", phone: "9810000033", description: "Whole pizzas and slices left at closing. Boxed and ready.", image: null, status: "available", reservedBy: null, reservedByName: "", views: 29, createdAt: now - 3 * HOUR, updatedAt: now - 3 * HOUR }
  ];

  const requests = [
    { id: "rq_1", receiverId: "u_r1", receiverName: "Feed the Future", foodRequired: "Rice or Biryani for 150 people", quantity: "10 kg", peopleCount: 150, urgency: "Immediate", description: "Night shelter distribution at 8 PM.", status: "open", createdAt: now - 2 * HOUR },
    { id: "rq_2", receiverId: "u_r2", receiverName: "Hope Home", foodRequired: "Vegetables & staples", quantity: "15 kg", peopleCount: 60, urgency: "Tomorrow", description: "Weekly ration for the children's home.", status: "open", createdAt: now - 6 * HOUR },
    { id: "rq_3", receiverId: "u_r3", receiverName: "Snehashray", foodRequired: "Soft food & desserts for seniors", quantity: "5 kg", peopleCount: 45, urgency: "Today", description: "Dinner service at 7 PM.", status: "open", createdAt: now - 3 * HOUR }
  ];

  const notifications = [
    { id: "n_1", userId: "u_d1", title: "New reservation", message: "Feed the Future reserved your 'Dal Makhani & Butter Rotis'. Please prepare for pickup.", type: "success", read: false, createdAt: now - 50 * 60000 },
    { id: "n_2", userId: "u_d1", title: "Food expiring soon", message: "'Veg Biryani with Raita' expires in 4 hours. Share it to reach more receivers.", type: "warning", read: false, createdAt: now - 100 * 60000 },
    { id: "n_3", userId: "u_d1", title: "Donation completed", message: "Your Rajma Chawal donation was completed. +20 Green Points earned!", type: "success", read: true, createdAt: daysAgo(1) },
    { id: "n_4", userId: "u_r1", title: "New food nearby", message: "Spice Garden listed 'Veg Biryani with Raita' in Delhi, 3 km away.", type: "info", read: false, createdAt: now - 120 * 60000 },
    { id: "n_5", userId: "u_r1", title: "Reservation confirmed", message: "You reserved 'Dal Makhani & Butter Rotis' from Spice Garden.", type: "success", read: false, createdAt: now - 45 * 60000 },
    { id: "n_6", userId: "u_r3", title: "Collection done", message: "You collected 'Cold Coffee & Fruit Snacks'. Thanks for serving!", type: "success", read: true, createdAt: now - 25 * 60000 },
    { id: "n_7", userId: "u_admin", title: "New signups awaiting review", message: "2 new accounts are pending verification.", type: "info", read: false, createdAt: daysAgo(1) }
  ];

  const favorites = [
    { id: "fav_1", receiverId: "u_r1", donationId: "d_1", createdAt: now - 90 * 60000 },
    { id: "fav_2", receiverId: "u_r1", donationId: "d_6", createdAt: now - 80 * 60000 }
  ];

  const feedback = [
    { id: "fb_1", userId: "u_r1", name: "Neha Gupta", role: "Receiver", rating: 5, message: "Seamless platform. We rescued 200+ meals last month through FoodLink.", createdAt: daysAgo(6) },
    { id: "fb_2", userId: "u_d1", name: "Rahul Sharma", role: "Donor", rating: 5, message: "Zero-waste kitchen is now a reality for our restaurant. Love the Green Points!", createdAt: daysAgo(9) },
    { id: "fb_3", userId: "u_r3", name: "Meera Iyer", role: "Receiver", rating: 4, message: "Reliable donations for our senior home. Would love more breakfast items.", createdAt: daysAgo(12) }
  ];

  const contacts = [
    { id: "ct_1", name: "Vikram Singh", email: "vikram@example.com", subject: "Partnership", message: "I run a catering service and want to donate daily surplus.", createdAt: daysAgo(4) }
  ];

  const settings = {
    id: "s_default",
    siteName: "FoodLink",
    siteTagline: "Save Food • Feed People • Reduce Waste",
    contactEmail: "hello@foodlink.app",
    contactPhone: "+91 98765 43210",
    emergencyContact: "+91 90000 10000",
    requireApproval: false,
    announcementsEnabled: true,
    currency: "₹"
  };

  return { users, donations, requests, notifications, favorites, feedback, contacts, settings: [settings] };
}

async function seed(force) {
  await connect();
  const data = buildData();

  const collections = {
    User: models.User,
    Donation: models.Donation,
    Request: models.Request,
    Notification: models.Notification,
    Favorite: models.Favorite,
    Feedback: models.Feedback,
    Contact: models.Contact,
    Setting: models.Setting
  };

  const dataKey = {
    User: "users",
    Donation: "donations",
    Request: "requests",
    Notification: "notifications",
    Favorite: "favorites",
    Feedback: "feedback",
    Contact: "contacts",
    Setting: "settings"
  };

  for (const key of Object.keys(collections)) {
    const M = collections[key];
    const exists = await M.countDocuments();
    if (force || exists === 0) {
      await M.deleteMany({});
      const rows = data[dataKey[key]];
      if (rows && rows.length) await M.insertMany(rows);
      console.log(`[seed] ${key}: ${rows ? rows.length : 0} rows`);
    } else {
      console.log(`[seed] ${key}: skipped (${exists} existing)`);
    }
  }

  console.log("[seed] Done.");
  if (require.main === module) process.exit(0);
}

module.exports = function seedIfEmpty() { return seed(false); };
// Exposed so repair scripts can reuse the canonical demo records instead of
// duplicating them.
module.exports.buildData = buildData;

if (require.main === module) {
  const force = process.argv.indexOf("--force") !== -1;
  seed(force);
}
