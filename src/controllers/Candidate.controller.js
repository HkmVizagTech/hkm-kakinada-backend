const Candidate = require('../models/Candidate.model');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const sendWhatsappGupshup = require('../utils/sendWhatsappGupshup');
const { 
  sendCertificateWithCloudinary, generateDocumentId, generateCertificatePDF, testCloudinaryConnection, testWhatsAppConnection
} = require('../utils/sendCertificateWithTemplate');
const cloudinary = require('../config/cloudinary');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const gupshup = require('@api/gupshup');

const tempDir = path.join(__dirname, '../temp/certificates');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const CandidateController = {
  
  createOrder: async (req, res) => {
    console.log("/users/create-order route hit");
    console.log(" Request body:", JSON.stringify(req.body, null, 2));
    
    const { amount, formData } = req.body;  
    
    if (!amount) {
      console.log(" Missing amount");
      return res.status(400).json({ status: "error", message: "Amount is required" });
    }
    
    if (!formData) {
      console.log(" Missing formData");
      return res.status(400).json({ status: "error", message: "Form data is required" });
    }
    
    console.log(" Amount:", amount, "FormData keys:", Object.keys(formData));
    
    const receipt = `receipt_${Date.now()}`;
    const options = { amount, currency: "INR", receipt };
    try {
      console.log(" Creating Razorpay order with options:", options);
      const order = await razorpay.orders.create(options);
      console.log(" Razorpay order created:", order.id);
      
      const normalizedNumber = "91" + formData.whatsappNumber;
      console.log(" Normalized number:", normalizedNumber);
      
      const candidate = new Candidate({
        serialNo: formData.serialNo,
        name: formData.name.trim(),
        gender: formData.gender,
        college: formData.college,
        course: formData.course,
        year: formData.year,
        dob: new Date(formData.dob),
        registrationDate: new Date(),
        collegeOrWorking: formData.collegeOrWorking,
        companyName: formData.companyName,
        whatsappNumber: normalizedNumber,
        paymentStatus: "Pending",
        orderId: order.id,
        paymentAmount: parseFloat(amount) / 100,
        receipt: receipt,
        email: formData.email,
      });
      
      console.log(" Saving candidate to database...");
      await candidate.save();
      console.log("Candidate saved successfully with ID:", candidate._id);
      
      return res.json(order);
    } catch (err) {
      console.error(" Error creating order and saving candidate:", err);
      console.error(" Error stack:", err.stack);
      return res.status(500).json({ status: "error", message: err.message });
    }
  },

  // New function to handle file uploads with order creation
  createOrderWithFile: async (req, res) => {
    console.log("🔵 /users/create-order-with-file route hit");
    
    try {
      const { amount } = req.body;
      const formData = JSON.parse(req.body.formData || '{}');
      
      console.log("📋 Form Data:", formData);
      console.log("💰 Amount:", amount);
      console.log("📁 File:", req.file ? req.file.originalname : 'No file');
      
      if (!amount) {
        return res.status(400).json({ status: "error", message: "Amount is required" });
      }
      
      if (!formData) {
        return res.status(400).json({ status: "error", message: "Form data is required" });
      }
      
      // If student, validate ID card upload
      if (formData.collegeOrWorking === "College" && !req.file) {
        return res.status(400).json({ status: "error", message: "Student ID card is required" });
      }
      
      let studentIdCardUrl = null;
      let studentIdCardPublicId = null;
      
      // Upload ID card to Cloudinary if provided
      if (req.file && formData.collegeOrWorking === "College") {
        console.log("☁️ Uploading ID card to Cloudinary...");
        
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              resource_type: 'image',
              folder: 'student-id-cards',
              public_id: `student_${Date.now()}`,
              transformation: [
                { width: 800, height: 600, crop: 'limit' },
                { quality: 'auto:good' }
              ]
            },
            (error, result) => {
              if (error) {
                console.error("❌ Cloudinary upload error:", error);
                reject(error);
              } else {
                console.log("✅ Cloudinary upload successful:", result.secure_url);
                resolve(result);
              }
            }
          ).end(req.file.buffer);
        });
        
        studentIdCardUrl = uploadResult.secure_url;
        studentIdCardPublicId = uploadResult.public_id;
      }
      
      // Create Razorpay order
      const receipt = `receipt_${Date.now()}`;
      const options = { amount, currency: "INR", receipt };
      
      console.log("💳 Creating Razorpay order with options:", options);
      const order = await razorpay.orders.create(options);
      console.log("✅ Razorpay order created:", order.id);
      
      const normalizedNumber = "91" + formData.whatsappNumber;
      
      // Create candidate with ID card info
      const candidate = new Candidate({
        serialNo: formData.serialNo,
        name: formData.name.trim(),
        gender: formData.gender,
        college: formData.college,
        course: formData.course,
        year: formData.year,
        dob: new Date(formData.dob),
        registrationDate: new Date(),
        collegeOrWorking: formData.collegeOrWorking,
        companyName: formData.companyName,
        whatsappNumber: normalizedNumber,
        paymentStatus: "Pending",
        orderId: order.id,
        paymentAmount: parseFloat(amount) / 100,
        receipt: receipt,
        email: formData.email,
        studentIdCardUrl,
        studentIdCardPublicId,
      });
      
      console.log("💾 Saving candidate to database...");
      await candidate.save();
      console.log("✅ Candidate saved successfully with ID:", candidate._id);
      
      return res.json(order);
    } catch (err) {
      console.error("❌ Error in createOrderWithFile:", err);
      return res.status(500).json({ status: "error", message: err.message });
    }
  },

  verifyPayment: async (req, res) => {
    console.log(" /users/verify-payment route hit");
    console.log(" Request body:", JSON.stringify(req.body, null, 2));
    
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    console.log("🔍 Looking for candidate with orderId:", razorpay_order_id);
    
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.log(" Signature verification failed");
      return res.status(400).json({ status: "fail", message: "Payment verification failed" });
    }

    console.log(" Signature verified successfully");

    try {
      const candidate = await Candidate.findOne({ orderId: razorpay_order_id });

      if (!candidate) {
        console.log(" No candidate found with orderId:", razorpay_order_id);
        return res.status(404).json({ status: "fail", message: "Candidate not found" });
      }

      console.log(" Candidate found:", candidate.name, "ID:", candidate._id);

      if (candidate.paymentStatus === "Paid") {
        return res.json({ message: "Already Registered", candidate });
      }

      candidate.paymentId = razorpay_payment_id;
      candidate.paymentDate = new Date();
      candidate.paymentStatus = "Paid";
      candidate.paymentMethod = "Online";
      candidate.paymentUpdatedBy = "manual";
      await candidate.save();

      if (!candidate.whatsappNumber) {
        console.error("Cannot send WhatsApp: candidate.whatsappNumber is missing for", candidate._id);
      } else {
        await sendWhatsappGupshup(candidate);
      }

      return res.json({ message: "success", candidate });

    } catch (err) {
      console.error("Error verifying payment:", err);
      return res.status(500).json({ status: "error", message: "Registration failed" });
    }
  },

  webhook: async (req, res) => {
    console.log("🔔 Webhook received");
    console.log("📋 Headers:", req.headers);
    
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (!webhookSecret) {
      console.error("❌ RAZORPAY_WEBHOOK_SECRET not configured");
      return res.status(500).send('Webhook secret not configured');
    }

    if (!signature) {
      console.error("❌ No signature in webhook request");
      return res.status(400).send('No signature provided');
    }

    const expectedSignature = crypto.createHmac('sha256', webhookSecret)
      .update(req.rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error("❌ Webhook signature verification failed");
      console.error("Expected:", expectedSignature);
      console.error("Received:", signature);
      return res.status(400).send('Invalid signature');
    }

    console.log("✅ Webhook signature verified");

    const event = req.body.event;
    const payload = req.body.payload;

    console.log("📨 Event:", event);
    console.log("📦 Payload:", JSON.stringify(payload, null, 2));

    if (event === "payment.captured") {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;
      const paymentId = payment.id;

      console.log("💳 Processing payment.captured event");
      console.log("🆔 Order ID:", orderId);
      console.log("💰 Payment ID:", paymentId);

      try {
        let candidate = await Candidate.findOne({ orderId: orderId });
        
        if (!candidate) {
          console.error("❌ No candidate found with orderId:", orderId);
          return res.status(404).json({ status: "error", message: "Candidate not found" });
        }

        console.log("👤 Found candidate:", candidate.name, "- Current status:", candidate.paymentStatus);

        if (candidate.paymentStatus !== "Paid") {
          candidate.paymentStatus = "Paid";
          candidate.paymentId = paymentId;
          candidate.paymentDate = new Date();
          candidate.paymentMethod = payment.method || "Online";
          candidate.razorpayPaymentData = payment;
          candidate.paymentUpdatedBy = "webhook";
          
          await candidate.save();
          console.log("✅ Payment status updated for:", candidate.name);

          // Send WhatsApp message
          if (!candidate.whatsappNumber) {
            console.error("⚠️ Cannot send WhatsApp: whatsappNumber is missing for", candidate._id);
          } else {
            try {
              await sendWhatsappGupshup(candidate);
              console.log("📱 WhatsApp message sent to:", candidate.whatsappNumber);
            } catch (whatsappError) {
              console.error("📱 WhatsApp sending failed:", whatsappError);
            }
          }
        } else {
          console.log("ℹ️ Payment already processed for:", candidate.name);
        }
        
        return res.json({ status: "ok" });
      } catch (err) {
        console.error("❌ Webhook processing error:", err);
        return res.status(500).json({ status: "error", message: err.message });
      }
    } else {
      console.log("🚫 Ignoring event:", event);
      return res.json({ status: "ignored" });
    }
  },

  createCandidate: async (req, res) => {
    try {
      const candidateData = {
        ...req.body,
        registrationDate: new Date(),
        lastUpdated: new Date()
      };
      const candidate = new Candidate(candidateData);
      await candidate.save();
      console.log(` New candidate created: ${candidate.name} (${candidate.email})`);
      res.status(201).json({
        status: 'success',
        message: 'Candidate created successfully',
        candidate
      });
    } catch (error) {
      console.error(' Error creating candidate:', error);
      res.status(400).json({
        status: 'error',
        message: error.message
      });
    }
  },

  getAllCandidates: async (req, res) => {
    try {
      const { page = 1, limit = 50, status, paymentStatus } = req.query;
      let query = {};
      if (status) query.status = status;
      if (paymentStatus) query.paymentStatus = paymentStatus;
      const candidates = await Candidate.find(query)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ registrationDate: -1 });
      const total = await Candidate.countDocuments(query);
      res.json({
        status: 'success',
        candidates,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalCandidates: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('Error fetching candidates:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },

  getCandidateById: async (req, res) => {
    try {
      const candidate = await Candidate.findById(req.params.id);
      if (!candidate) {
        return res.status(404).json({
          status: 'error',
          message: 'Candidate not found'
        });
      }
      res.json({
        status: 'success',
        candidate
      });
    } catch (error) {
      console.error(' Error fetching candidate:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },

  updateCandidate: async (req, res) => {
    try {
      const updates = {
        ...req.body,
        lastUpdated: new Date(),
        updatedBy: 'saikiran11461'
      };
      const candidate = await Candidate.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
      );
      if (!candidate) {
        return res.status(404).json({
          status: 'error',
          message: 'Candidate not found'
        });
      }
      console.log(` Candidate updated: ${candidate.name} by saikiran11461`);
      res.json({
        status: 'success',
        message: 'Candidate updated successfully',
        candidate
      });
    } catch (error) {
      console.error(' Error updating candidate:', error);
      res.status(400).json({
        status: 'error',
        message: error.message
      });
    }
  },

  deleteCandidate: async (req, res) => {
    try {
      const candidate = await Candidate.findByIdAndDelete(req.params.id);
      if (!candidate) {
        return res.status(404).json({
          status: 'error',
          message: 'Candidate not found'
        });
      }
      console.log(` Candidate deleted: ${candidate.name} by saikiran11461`);
      res.json({
        status: 'success',
        message: 'Candidate deleted successfully'
      });
    } catch (error) {
      console.error(' Error deleting candidate:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },

  deleteByName: async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({
          status: 'error',
          message: 'Name is required'
        });
      }
      const result = await Candidate.deleteMany({ 
        name: { $regex: new RegExp(name, 'i') } 
      });
      console.log(` Deleted ${result.deletedCount} candidates with name: ${name} by saikiran11461`);
      res.json({
        status: 'success',
        message: `Deleted ${result.deletedCount} candidates`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error(' Error deleting candidates by name:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },
        

markAttendance: async (req, res) => {
  const { whatsappNumber } = req.body;
  let normalizedNumber;
  try {
    console.log("📱 Attendance request for number:", whatsappNumber);
    
    if (!whatsappNumber) {
      return res.status(400).json({ message: "WhatsApp number is required" });
    }
    if (/^\d{10}$/.test(whatsappNumber)) {
      normalizedNumber = "91" + whatsappNumber;
    } else if (/^91\d{10}$/.test(whatsappNumber)) {
      normalizedNumber = whatsappNumber;
    } else {
      return res.status(400).json({ message: "Invalid WhatsApp number format" });
    }

    console.log("🔍 Looking for candidate with normalized number:", normalizedNumber);


    const allCandidates = await Candidate.find({ whatsappNumber: normalizedNumber }).sort({ createdAt: -1 });
    console.log(`📊 Found ${allCandidates.length} total registrations for this number`);
    
    if (allCandidates.length > 0) {
      allCandidates.forEach((c, index) => {
        console.log(`   ${index + 1}. ${c.name} - Status: ${c.paymentStatus} - Created: ${c.createdAt}`);
      });
    }

 
    let candidate = await Candidate.findOne(
      { whatsappNumber: normalizedNumber, paymentStatus: "Paid" }
    ).sort({ createdAt: -1 });

    if (!candidate) {
      console.log(" No candidate found with Paid status");
      
      
      const latestCandidate = await Candidate.findOne({ whatsappNumber: normalizedNumber }).sort({ createdAt: -1 });
      if (latestCandidate) {
        console.log(` Found candidate ${latestCandidate.name} but payment status is: ${latestCandidate.paymentStatus}`);
        return res.status(403).json({ message: "Payment not completed. Attendance cannot be marked." });
      } else {
        console.log(" No candidate found with this number at all");
        return res.status(404).json({ message: "Number not registered! Please register here: https://youthfest.harekrishnavizag.org/ And please visit the enquiry counter." });
      }
    }

    console.log(` Found paid candidate: ${candidate.name} (${candidate.paymentStatus})`);
    console.log(` Attendance already marked: ${candidate.attendance === true}`);
    


    if (!candidate.attendanceToken) {
      candidate.attendanceToken = candidate._id.toString();
      console.log("🎫 Generated new attendance token");
    }


    if (candidate.attendance !== true) {
      candidate.attendance = true;
      candidate.attendanceDate = new Date();
      await candidate.save();
      console.log(" Attendance marked successfully");
    } else {
      console.log("ℹ Attendance was already marked");
    }

    const details = {
      status: candidate.attendance === true ? "already-marked" : "success",
      message: candidate.attendance === true ? "Attendance already taken" : "Attendance marked successfully",
      attendanceToken: candidate.attendanceToken,
      name: candidate.name,
      email: candidate.email,
      city: candidate.city,
      college: candidate.college,
      branch: candidate.branch,
    };

    if (candidate.attendance === true) {
      return res.json(details);
    }

    candidate.attendance = true;
    await candidate.save();
    await sendWhatsappGupshup(candidate, [candidate.name], "88021e4e-88ae-4cba-bdba-f9b1be3b4948");

    res.json(details);
  } catch (err) {
    console.error("Attendance marking error:", err);
    res.status(500).json({ message: "Server error" });
  }
},

adminAttendanceScan: async (req, res) => {
  try {
    const { token } = req.body;
    console.log(" Admin scanning QR token:", token);
    
    const candidate = await Candidate.findOne({ attendanceToken: token });
    
    if (!candidate) {
      console.log(" No candidate found with attendance token:", token);
      return res.status(404).json({ message: "Candidate not found" });
    }
    
    console.log(` Found candidate: ${candidate.name} (${candidate.email})`);
    console.log(` Attendance status: ${candidate.attendance ? 'Marked' : 'Not marked'}`);
    console.log(`Admin attendance status: ${candidate.adminAttendance ? 'Already scanned' : 'Not scanned yet'}`);
    
    if (!candidate.attendance) {
      console.log(" Candidate did not mark attendance first");
      return res.status(400).json({ message: "Candidate did not mark attendance" });
    }
    
    if (candidate.adminAttendance) {
      console.log(" Admin attendance already marked");
      return res.status(200).json({
        status: "already-marked",
        message: "Admin already marked attendance",
        name: candidate.name,
        email: candidate.email,
        phone: candidate.whatsappNumber,
        gender: candidate.gender,
        college: candidate.college,
        course: candidate.course,
      });
    }

    candidate.adminAttendance = true;
    candidate.adminAttendanceDate = new Date();
    await candidate.save();
    
    console.log(` Admin attendance marked for: ${candidate.name}`);

    res.json({
      status: "success",
      message: "Admin attendance marked successfully",
      name: candidate.name,
      email: candidate.email,
      phone: candidate.whatsappNumber,
      gender: candidate.gender,
      college: candidate.college,
      course: candidate.course,
      year: candidate.year
    });
  } catch (error) {
    console.error("Error in admin attendance scan:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
},

deleteByName: async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Name is required'
      });
    }
    const result = await Candidate.deleteMany({
      name: { $regex: new RegExp(name, 'i') }
    });
    console.log(` Deleted ${result.deletedCount} candidates with name: ${name} by saikiran11461`);
    res.json({
      status: 'success',
      message: `Deleted ${result.deletedCount} candidates`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error(' Error deleting candidates by name:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
},

createOrderForExistingCandidate: async (req, res) => {
  try {
    const { amount, candidateId } = req.body;
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        status: 'error',
        message: 'Candidate not found'
      });
    }
    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `receipt_${candidateId}_${Date.now()}`,
      notes: {
        candidateId: candidateId,
        candidateName: candidate.name,
        candidateEmail: candidate.email
      }
    };
    const order = await razorpay.orders.create(options);
    await Candidate.findByIdAndUpdate(candidateId, {
      razorpayOrderId: order.id,
      orderAmount: amount,
      orderDate: new Date(),
      paymentStatus: 'Pending'
    });
    console.log(` Order created for ${candidate.name}: ${order.id}`);
    res.json({
      status: 'success',
      order,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error(' Error creating order:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
},

verifyPaymentForExistingCandidate: async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");
    if (expectedSignature === razorpay_signature) {
      const candidate = await Candidate.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          paymentStatus: 'Paid',
          paymentDate: new Date(),
          verifiedBy: 'saikiran11461'
        },
        { new: true }
      );
      if (!candidate) {
        return res.status(404).json({
          status: 'error',
          message: 'Candidate not found for this order'
        });
      }
      console.log(` Payment verified for ${candidate.name}: ${razorpay_payment_id}`);
      try {
        await sendWhatsappGupshup(candidate);
        console.log(` WhatsApp sent to ${candidate.name}`);
      } catch (whatsappError) {
        console.error(' WhatsApp sending failed:', whatsappError);
      }
      res.json({
        status: 'success',
        message: 'Payment verified successfully',
        candidate
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Payment verification failed'
      });
    }
  } catch (error) {
    console.error(' Error verifying payment:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
},

verifyPaymentId: async (req, res) => {
  try {
    console.log("🔍 Looking for candidate with paymentId:", req.params.id);
    
    
    const candidate = await Candidate.findOne({ paymentId: req.params.id });
    
    if (!candidate) {
      console.log(" No candidate found with paymentId:", req.params.id);
      return res.status(404).json({
        status: 'error',
        message: 'Candidate not found'
      });
    }
    
    console.log(" Candidate found:", candidate.name, "Payment Status:", candidate.paymentStatus);
    
    res.json({
      status: 'success',
      candidate: {
        name: candidate.name,
        email: candidate.email,
        paymentStatus: candidate.paymentStatus,
        orderId: candidate.orderId,
        paymentId: candidate.paymentId,
        paymentDate: candidate.paymentDate,
        paymentAmount: candidate.paymentAmount
      }
    });
  } catch (error) {
    console.error(' Error fetching payment verification:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
},



markAttendanceById: async (req, res) => {
  try {
    const { candidateId } = req.body;
    const candidate = await Candidate.findByIdAndUpdate(
      candidateId,
      {
        attendance: true,
        attendanceDate: new Date(),
        attendanceMarkedBy: 'saikiran11461'
      },
      { new: true }
    );
    if (!candidate) {
      return res.status(404).json({
        status: 'error',
        message: 'Candidate not found'
      });
    }
    console.log(` Attendance marked for ${candidate.name} by saikiran11461`);
    res.json({
      status: 'success',
      message: 'Attendance marked successfully',
      candidate
    });
  } catch (error) {
    console.error(' Error marking attendance:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
},

adminDirectAttendanceScan: async (req, res) => {
  try {
    const { qrData } = req.body;
    let candidateId;
    try {
      const qrJson = JSON.parse(qrData);
      candidateId = qrJson.candidateId || qrJson.id;
    } catch {
      candidateId = qrData;
    }
    const candidate = await Candidate.findByIdAndUpdate(
      candidateId,
      {
        attendance: true,
        attendanceDate: new Date(),
        attendanceMarkedBy: 'admin_scan_saikiran11461',
        qrScanned: true,
        qrScannedAt: new Date()
      },
      { new: true }
    );
    if (!candidate) {
      return res.status(404).json({
        status: 'error',
        message: 'Candidate not found'
      });
    }
    console.log(` QR scanned attendance for ${candidate.name} by saikiran11461`);
    res.json({
      status: 'success',
      message: 'Attendance marked via QR scan',
      candidate
    });
  } catch (error) {
    console.error(' Error in admin attendance scan:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
},

attendanceList: async (req, res) => {
  try {
    const { date, status } = req.query;
    let query = {};
    if (status === 'present') query.attendance = true;
    if (status === 'absent') query.attendance = { $ne: true };
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.attendanceDate = { $gte: startOfDay, $lte: endOfDay };
    }
    const candidates = await Candidate.find(query)
      .select('name email whatsappNumber college course attendance attendanceDate')
      .sort({ attendanceDate: -1 });
    const summary = {
      total: candidates.length,
      present: candidates.filter(c => c.attendance).length,
      absent: candidates.filter(c => !c.attendance).length
    };
    res.json({
      status: 'success',
      summary,
      candidates
    });
  } catch (error) {
    console.error('Error fetching attendance list:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
},



  
  adminScannedList: async (req, res) => {
    try {
      const candidates = await Candidate.find({ adminAttendance: true })
        .select('name email whatsappNumber college course branch gender year attendanceDate adminAttendanceDate')
        .sort({ adminAttendanceDate: -1 });

      console.log(`📋 Found ${candidates.length} admin scanned candidates`);

      res.json({
        status: 'success',
        total: candidates.length,
        candidates
      });
    } catch (error) {
      console.error('Error fetching admin scanned list:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },



   getEligibleCandidatesForCertificate: async (req, res) => {
    try {
      const eligibleCandidates = await Candidate.find(
        { attendance: true, paymentStatus: "Paid" },
        {
          _id: 1, name: 1, email: 1, whatsappNumber: 1, college: 1, course: 1, gender: 1,
          attendanceDate: 1, certificateSent: 1, certificateSentDate: 1, certificateSentBy: 1,
          certificateDocumentId: 1, certificateCloudinaryUrl: 1, certificateCloudinaryPublicId: 1,
          certificateCloudinaryAssetId: 1, certificateFileName: 1, certificateFileSize: 1,
          certificateStorageMethod: 1, certificateWhatsAppMessageId: 1, certificateWhatsAppStatus: 1,
          certificateDeliveryMethod: 1
        }
      ).sort({ attendanceDate: -1 });

      const summary = {
        total: eligibleCandidates.length,
        certificatesSent: eligibleCandidates.filter(c => c.certificateSent).length,
        pendingCertificates: eligibleCandidates.filter(c => !c.certificateSent).length,
        withCloudinaryFiles: eligibleCandidates.filter(c => c.certificateCloudinaryUrl).length
      };

      console.log(` Certificate eligibility check by saikiran11461 at 2025-08-24 18:19:32 UTC - Found ${eligibleCandidates.length} eligible candidates`);

      return res.json({
        status: "success",
        summary,
        candidates: eligibleCandidates,
        storageMethod: "cloudinary",
        cloudName: "ddmzeqpkc",
        fetchedAt: new Date().toISOString(),
        fetchedBy: 'saikiran11461',
        serverTime: new Date().toISOString(),
        apiVersion: "2.0.0"
      });
    } catch (error) {
      console.error(' Error fetching eligible candidates by saikiran11461:', error);
      return res.status(500).json({
        status: "error",
        message: error.message,
        timestamp: new Date().toISOString(),
        requestedBy: 'saikiran11461',
        apiVersion: "2.0.0"
      });
    }
  },

  sendCertificates: async (req, res) => {
    try {
      console.log(` Bulk certificate sending initiated by saikiran11461 at 2025-08-24 18:19:32 UTC`);
      
      const { candidateIds } = req.body;
      let query = { attendance: true, paymentStatus: "Paid" };
      if (candidateIds && candidateIds.length > 0) query._id = { $in: candidateIds };

      const candidates = await Candidate.find(query);
      if (candidates.length === 0) {
        return res.status(404).json({ 
          status: "error", 
          message: "No eligible candidates found", 
          timestamp: new Date().toISOString(),
          requestedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }

      let successCount = 0, failureCount = 0, alreadySentCount = 0, results = [];

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        
        console.log(`📝 Processing certificate ${i + 1}/${candidates.length} for ${candidate.name} by saikiran11461`);
        
        if (candidate.certificateSent) {
          alreadySentCount++;
          results.push({ 
            candidateId: candidate._id, 
            name: candidate.name, 
            whatsappNumber: candidate.whatsappNumber, 
            status: 'already-sent', 
            sentDate: candidate.certificateSentDate,
            documentId: candidate.certificateDocumentId,
            cloudinaryUrl: candidate.certificateCloudinaryUrl,
            cloudinaryPublicId: candidate.certificateCloudinaryPublicId,
            processedAt: new Date().toISOString(),
            storageMethod: "cloudinary"
          });
          continue;
        }

        try {
   
          console.log(`☁️ Using Cloudinary certificate system for ${candidate.name} by saikiran11461`);
          const certificatePath = tempDir;
          const result = await sendCertificateWithCloudinary(candidate, certificatePath);
          
          if (!result.success) {
            throw new Error(result.error);
          }

        
          await Candidate.findByIdAndUpdate(candidate._id, {
            certificateSent: true,
            certificateSentDate: new Date(),
            certificateSentBy: 'saikiran11461',
            certificateDocumentId: result.documentId,
            certificateCloudinaryUrl: result.cloudinary.url,
            certificateCloudinaryPublicId: result.cloudinary.publicId,
            certificateCloudinaryAssetId: result.cloudinary.assetId,
            certificateFileName: `${result.documentId}.pdf`,
            certificateFileSize: result.cloudinary.size,
            certificateStorageMethod: 'cloudinary',
            certificateWhatsAppMessageId: result.messageId,
            certificateWhatsAppStatus: result.status,
            certificateDeliveryMethod: result.method,
            updatedAt: new Date(),
            updatedBy: 'saikiran11461'
          });

          successCount++;
          console.log(` Certificate sent successfully to ${candidate.name} - Document ID: ${result.documentId}`);
          
          results.push({
            candidateId: candidate._id, 
            name: candidate.name, 
            whatsappNumber: candidate.whatsappNumber,
            status: 'success', 
            sentAt: new Date().toISOString(),
            documentId: result.documentId,
            cloudinaryUrl: result.cloudinary.url,
            cloudinaryPublicId: result.cloudinary.publicId,
            cloudinaryAssetId: result.cloudinary.assetId,
            fileSize: result.cloudinary.size,
            whatsappMessageId: result.messageId,
            whatsappStatus: result.status,
            deliveryMethod: result.method,
            storageMethod: 'cloudinary',
            processedBy: 'saikiran11461'
          });
          
        } catch (error) {
          failureCount++;
          console.error(` Failed to send certificate to ${candidate.name} by saikiran11461:`, error.message);
          
          results.push({
            candidateId: candidate._id, 
            name: candidate.name, 
            whatsappNumber: candidate.whatsappNumber,
            status: 'failed', 
            error: error.message, 
            failedAt: new Date().toISOString(),
            processedBy: 'saikiran11461'
          });
        }


        if (i < candidates.length - 1) {
          console.log(`⏳ Waiting 3 seconds before next certificate by saikiran11461...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      const summary = {
        total: candidates.length,
        successful: successCount,
        failed: failureCount,
        alreadySent: alreadySentCount,
        successRate: candidates.length > 0 ? ((successCount / candidates.length) * 100).toFixed(2) + '%' : '0%'
      };

      console.log(`📊 Bulk certificate processing completed by saikiran11461 at 2025-08-24 18:19:32 UTC - Success: ${successCount}, Failed: ${failureCount}, Already sent: ${alreadySentCount}`);

      return res.json({
        status: "completed",
        message: `Certificate processing completed. Success: ${successCount}, Failed: ${failureCount}, Already sent: ${alreadySentCount}`,
        summary,
        results,
        storageMethod: "cloudinary",
        cloudName: "ddmzeqpkc",
        processedAt: new Date().toISOString(),
        processedBy: 'saikiran11461',
        serverTime: new Date().toISOString(),
        apiVersion: "2.0.0"
      });
    } catch (error) {
      console.error(' Error in bulk certificate sending by saikiran11461:', error);
      return res.status(500).json({
        status: "error",
        message: error.message,
        timestamp: new Date().toISOString(),
        requestedBy: 'saikiran11461',
        apiVersion: "2.0.0"
      });
    }
  },

  sendSingleCertificate: async (req, res) => {
    try {
      const { candidateId } = req.body;
      
      console.log(` Single certificate sending initiated by saikiran11461 at 2025-08-24 18:19:32 UTC for candidate ID: ${candidateId}`);
      
      const candidate = await Candidate.findById(candidateId);

      if (!candidate) {
        return res.status(404).json({ 
          status: "error", 
          message: "Candidate not found", 
          candidateId: candidateId,
          timestamp: new Date().toISOString(),
          requestedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }
      
      if (!candidate.attendance || candidate.paymentStatus !== "Paid") {
        console.log(` Candidate ${candidate.name} not eligible - attendance: ${candidate.attendance}, payment: ${candidate.paymentStatus}`);
        return res.status(400).json({
          status: "error",
          message: `Candidate not eligible: attendance=${candidate.attendance}, payment=${candidate.paymentStatus}`,
          candidate: { 
            id: candidate._id,
            name: candidate.name, 
            attendance: candidate.attendance, 
            paymentStatus: candidate.paymentStatus 
          },
          timestamp: new Date().toISOString(),
          checkedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }
      
      if (candidate.certificateSent) {
        console.log(`Certificate already sent to ${candidate.name} - Document ID: ${candidate.certificateDocumentId}`);
        return res.status(200).json({
          status: "already-sent",
          message: `Certificate already sent to ${candidate.name} on ${candidate.certificateSentDate?.toLocaleDateString()}`,
          candidate: { 
            id: candidate._id,
            name: candidate.name, 
            whatsappNumber: candidate.whatsappNumber,
            certificateSentDate: candidate.certificateSentDate, 
            certificateSentBy: candidate.certificateSentBy,
            documentId: candidate.certificateDocumentId,
            cloudinaryUrl: candidate.certificateCloudinaryUrl,
            cloudinaryPublicId: candidate.certificateCloudinaryPublicId,
            storageMethod: 'cloudinary'
          },
          checkedAt: new Date().toISOString(),
          checkedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }

      console.log(` Generating and sending certificate for ${candidate.name} via Cloudinary by saikiran11461`);
      

      const certificatePath = tempDir;
      const result = await sendCertificateWithCloudinary(candidate, certificatePath);
      
      if (!result.success) {
        console.error(` Failed to send certificate to ${candidate.name} by saikiran11461:`, result.error);
        return res.status(500).json({
          status: "error",
          message: `Failed to send certificate: ${result.error}`,
          details: result,
          candidateId: candidateId,
          candidateName: candidate.name,
          timestamp: new Date().toISOString(),
          processedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }

    
      await Candidate.findByIdAndUpdate(candidateId, {
        certificateSent: true,
        certificateSentDate: new Date(),
        certificateSentBy: 'saikiran11461',
        certificateDocumentId: result.documentId,
        certificateCloudinaryUrl: result.cloudinary.url,
        certificateCloudinaryPublicId: result.cloudinary.publicId,
        certificateCloudinaryAssetId: result.cloudinary.assetId,
        certificateFileName: `${result.documentId}.pdf`,
        certificateFileSize: result.cloudinary.size,
        certificateStorageMethod: 'cloudinary',
        certificateWhatsAppMessageId: result.messageId,
        certificateWhatsAppStatus: result.status,
        certificateDeliveryMethod: result.method,
        updatedAt: new Date(),
        updatedBy: 'saikiran11461'
      });

      console.log(` Certificate sent successfully to ${candidate.name} by saikiran11461 - Document ID: ${result.documentId}, Cloudinary URL: ${result.cloudinary.url}`);

      return res.json({
        status: "success",
        message: `Certificate sent successfully to ${candidate.name}`,
        candidate: {
          id: candidate._id, 
          name: candidate.name, 
          email: candidate.email,
          whatsappNumber: candidate.whatsappNumber,
          college: candidate.college,
          course: candidate.course,
          certificateSentDate: new Date().toISOString(),
          documentId: result.documentId,
          cloudinaryUrl: result.cloudinary.url,
          cloudinaryPublicId: result.cloudinary.publicId,
          cloudinaryAssetId: result.cloudinary.assetId,
          fileSize: result.cloudinary.size,
          storageMethod: 'cloudinary'
        },
        whatsapp: {
          messageId: result.messageId,
          status: result.status,
          method: result.method
        },
        cloudinary: {
          url: result.cloudinary.url,
          publicId: result.cloudinary.publicId,
          assetId: result.cloudinary.assetId,
          size: result.cloudinary.size,
          folder: 'certificates',
          cloudName: 'ddmzeqpkc'
        },
        processedAt: new Date().toISOString(),
        processedBy: 'saikiran11461',
        serverTime: new Date().toISOString(),
        apiVersion: "2.0.0"
      });
    } catch (error) {
      console.error('Error in single certificate sending by saikiran11461:', error);
      return res.status(500).json({
        status: "error",
        message: `Server error: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestedBy: 'saikiran11461',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        apiVersion: "2.0.0"
      });
    }
  },

  generateSingleCertificateOnly: async (req, res) => {
    try {
      const { candidateId } = req.body;
      
      console.log(` Certificate generation only requested by saikiran11461 at 2025-08-24 18:19:32 UTC for candidate ID: ${candidateId}`);
      
      const candidate = await Candidate.findById(candidateId);
      
      if (!candidate) {
        return res.status(404).json({ 
          status: "error", 
          message: "Candidate not found",
          candidateId: candidateId,
          timestamp: new Date().toISOString(),
          requestedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }
      
      if (!candidate.attendance || candidate.paymentStatus !== "Paid") {
        return res.status(400).json({ 
          status: "error", 
          message: "Candidate not eligible",
          candidate: { 
            id: candidate._id,
            name: candidate.name, 
            attendance: candidate.attendance, 
            paymentStatus: candidate.paymentStatus 
          },
          timestamp: new Date().toISOString(),
          checkedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }

      const documentId = generateDocumentId(candidate.name);
      const outputPath = path.join(tempDir, `${documentId}.pdf`);
      
      console.log(` Generating certificate PDF for ${candidate.name} by saikiran11461`);
      const certData = await generateCertificatePDF(candidate.name, outputPath, documentId);

      console.log(` Certificate generated for ${candidate.name} by saikiran11461 - Document ID: ${documentId}`);

      return res.json({ 
        status: "success", 
        path: certData.outputPath, 
        candidate: {
          id: candidate._id,
          name: candidate.name,
          email: candidate.email,
          whatsappNumber: candidate.whatsappNumber
        },
        certificate: {
          documentId: documentId,
          fileName: certData.fileName,
          fileSize: certData.fileSize,
          outputPath: certData.outputPath
        },
        generatedAt: new Date().toISOString(),
        generatedBy: 'saikiran11461',
        serverTime: new Date().toISOString(),
        apiVersion: "2.0.0"
      });
    } catch (error) {
      console.error(' Error generating certificate by saikiran11461:', error);
      return res.status(500).json({ 
        status: "error", 
        message: error.message,
        candidateId: req.body.candidateId,
        timestamp: new Date().toISOString(),
        requestedBy: 'saikiran11461',
        apiVersion: "2.0.0"
      });
    }
  },

  getCertificateByDocumentId: async (req, res) => {
    try {
      const { documentId } = req.params;
      
      console.log(` Certificate lookup by Document ID: ${documentId} requested by saikiran11461 at 2025-08-24 18:19:32 UTC`);
      

      const candidate = await Candidate.findOne({ certificateDocumentId: documentId });
      
      if (!candidate) {
        console.log(` Certificate not found in database for Document ID: ${documentId}`);
        return res.status(404).json({
          status: "error",
          message: "Certificate not found in database",
          documentId: documentId,
          timestamp: new Date().toISOString(),
          searchedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }

      console.log(` Certificate found for ${candidate.name} - Document ID: ${documentId}`);


      let cloudinaryDirectUrl = null;
      let cloudinaryViewUrl = null;
      if (candidate.certificateCloudinaryPublicId) {
        cloudinaryDirectUrl = `https://res.cloudinary.com/ddmzeqpkc/image/upload/${candidate.certificateCloudinaryPublicId}.pdf`;
        cloudinaryViewUrl = `https://res.cloudinary.com/ddmzeqpkc/image/upload/v1756058000/${candidate.certificateCloudinaryPublicId}.pdf`;
      }
      
      return res.json({
        status: "success",
        certificate: {
          documentId: documentId,
          candidate: {
            id: candidate._id,
            name: candidate.name,
            email: candidate.email,
            whatsappNumber: candidate.whatsappNumber,
            college: candidate.college,
            course: candidate.course,
            gender: candidate.gender
          },
          certificateData: {
            sentDate: candidate.certificateSentDate,
            sentBy: candidate.certificateSentBy,
            cloudinaryUrl: candidate.certificateCloudinaryUrl,
            cloudinaryPublicId: candidate.certificateCloudinaryPublicId,
            cloudinaryAssetId: candidate.certificateCloudinaryAssetId,
            fileName: candidate.certificateFileName,
            fileSize: candidate.certificateFileSize,
            storageMethod: candidate.certificateStorageMethod || 'cloudinary',
            whatsappMessageId: candidate.certificateWhatsAppMessageId,
            whatsappStatus: candidate.certificateWhatsAppStatus,
            deliveryMethod: candidate.certificateDeliveryMethod
          },
          cloudinaryInfo: {
            directUrl: cloudinaryDirectUrl,
            viewUrl: cloudinaryViewUrl,
            publicId: candidate.certificateCloudinaryPublicId,
            assetId: candidate.certificateCloudinaryAssetId,
            cloudName: 'ddmzeqpkc',
            folder: 'certificates'
          }
        },
        storageMethod: "cloudinary",
        fetchedAt: new Date().toISOString(),
        fetchedBy: 'saikiran11461',
        serverTime: new Date().toISOString(),
        apiVersion: "2.0.0"
      });
    } catch (error) {
      console.error(' Error retrieving certificate by Document ID by saikiran11461:', error);
      return res.status(500).json({
        status: "error",
        message: error.message,
        documentId: req.params.documentId,
        timestamp: new Date().toISOString(),
        requestedBy: 'saikiran11461',
        apiVersion: "2.0.0"
      });
    }
  },

  getCertificateStatistics: async (req, res) => {
    try {
      console.log(` Certificate statistics requested by saikiran11461 at 2025-08-24 18:19:32 UTC`);
      
      const totalEligible = await Candidate.countDocuments({ attendance: true, paymentStatus: "Paid" });
      const totalSent = await Candidate.countDocuments({ 
        attendance: true, 
        paymentStatus: "Paid", 
        certificateSent: true 
      });
      const totalPending = totalEligible - totalSent;
      const cloudinaryCount = await Candidate.countDocuments({ 
        certificateCloudinaryUrl: { $exists: true, $ne: null } 
      });
      

      const pdfDeliveries = await Candidate.countDocuments({ certificateDeliveryMethod: 'pdf_attachment' });
      const textDeliveries = await Candidate.countDocuments({ certificateDeliveryMethod: 'text_message' });
      
      const recentCertificates = await Candidate.find(
        { certificateSent: true },
        {
          name: 1, certificateSentDate: 1, certificateDocumentId: 1, 
          certificateCloudinaryUrl: 1, certificateSentBy: 1, certificateDeliveryMethod: 1,
          certificateWhatsAppStatus: 1
        }
      ).sort({ certificateSentDate: -1 }).limit(10);

      const statistics = {
        overview: {
          totalEligible,
          totalSent,
          totalPending,
          completionRate: totalEligible > 0 ? ((totalSent / totalEligible) * 100).toFixed(2) + '%' : '0%'
        },
        storage: {
          cloudinaryCount,
          storageMethod: 'cloudinary',
          cloudName: 'ddmzeqpkc',
          folder: 'certificates'
        },
        delivery: {
          pdfAttachments: pdfDeliveries,
          textMessages: textDeliveries,
          totalDelivered: pdfDeliveries + textDeliveries
        },
        recent: recentCertificates
      };

      return res.json({
        status: "success",
        statistics,
        fetchedAt: new Date().toISOString(),
        fetchedBy: 'saikiran11461',
        serverTime: new Date().toISOString(),
        apiVersion: "2.0.0"
      });
    } catch (error) {
      console.error(' Error fetching certificate statistics by saikiran11461:', error);
      return res.status(500).json({
        status: "error",
        message: error.message,
        timestamp: new Date().toISOString(),
        requestedBy: 'saikiran11461',
        apiVersion: "2.0.0"
      });
    }
  },

  resendCertificate: async (req, res) => {
    try {
      const { candidateId } = req.body;
      
      console.log(` Certificate resend requested by saikiran11461 at 2025-08-24 18:19:32 UTC for candidate ID: ${candidateId}`);
      
      const candidate = await Candidate.findById(candidateId);

      if (!candidate) {
        return res.status(404).json({ 
          status: "error", 
          message: "Candidate not found", 
          candidateId: candidateId,
          timestamp: new Date().toISOString(),
          requestedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }
      
      if (!candidate.attendance || candidate.paymentStatus !== "Paid") {
        return res.status(400).json({
          status: "error",
          message: "Candidate not eligible for certificate",
          candidate: { 
            id: candidate._id,
            name: candidate.name, 
            attendance: candidate.attendance, 
            paymentStatus: candidate.paymentStatus 
          },
          timestamp: new Date().toISOString(),
          checkedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }


      const oldDocumentId = candidate.certificateDocumentId;
      const oldCloudinaryUrl = candidate.certificateCloudinaryUrl;

      console.log(` Regenerating certificate for ${candidate.name} (replacing ${oldDocumentId}) by saikiran11461`);

 
      const certificatePath = tempDir;
      const result = await sendCertificateWithCloudinary(candidate, certificatePath);
      
      if (!result.success) {
        return res.status(500).json({
          status: "error",
          message: `Failed to resend certificate: ${result.error}`,
          candidateId: candidateId,
          candidateName: candidate.name,
          timestamp: new Date().toISOString(),
          processedBy: 'saikiran11461',
          apiVersion: "2.0.0"
        });
      }

    
      await Candidate.findByIdAndUpdate(candidateId, {
        certificateSent: true,
        certificateSentDate: new Date(),
        certificateSentBy: 'saikiran11461',
        certificateDocumentId: result.documentId,
        certificateCloudinaryUrl: result.cloudinary.url,
        certificateCloudinaryPublicId: result.cloudinary.publicId,
        certificateCloudinaryAssetId: result.cloudinary.assetId,
        certificateFileName: `${result.documentId}.pdf`,
        certificateFileSize: result.cloudinary.size,
        certificateStorageMethod: 'cloudinary',
        certificateWhatsAppMessageId: result.messageId,
        certificateWhatsAppStatus: result.status,
        certificateDeliveryMethod: result.method,
        updatedAt: new Date(),
        updatedBy: 'saikiran11461'
      });

      console.log(` Certificate resent successfully to ${candidate.name} by saikiran11461 - New Document ID: ${result.documentId}`);

      return res.json({
        status: "success",
        message: `Certificate resent successfully to ${candidate.name}`,
        candidate: {
          id: candidate._id,
          name: candidate.name,
          email: candidate.email,
          whatsappNumber: candidate.whatsappNumber
        },
        oldCertificate: {
          documentId: oldDocumentId,
          cloudinaryUrl: oldCloudinaryUrl
        },
        newCertificate: {
          documentId: result.documentId,
          cloudinaryUrl: result.cloudinary.url,
          cloudinaryPublicId: result.cloudinary.publicId,
          whatsappMessageId: result.messageId,
          whatsappStatus: result.status,
          deliveryMethod: result.method
        },
        processedAt: new Date().toISOString(),
        processedBy: 'saikiran11461',
        serverTime: new Date().toISOString(),
        apiVersion: "2.0.0"
      });

    } catch (error) {
      console.error(' Error resending certificate by saikiran11461:', error);
      return res.status(500).json({
        status: "error",
        message: error.message,
        candidateId: req.body.candidateId,
        timestamp: new Date().toISOString(),
        requestedBy: 'saikiran11461',
        apiVersion: "2.0.0"
      });
    }
  },

getCertificateSystemHealth: async (req, res) => {
  try {
    console.log(` Certificate system health check by saikiran11461 at 2025-08-24 18:19:32 UTC`);

    const cloudinaryTest = await testCloudinaryConnection();
    const whatsappTest = await testWhatsAppConnection();

    const dbCheck = await Candidate.countDocuments().limit(1);
    const dbHealthy = dbCheck >= 0;

    const tempDirExists = fs.existsSync(tempDir);

    const overallHealth = cloudinaryTest.success && whatsappTest.success && dbHealthy && tempDirExists;

    res.json({
      status: "success",
      health: {
        overall: overallHealth ? 'healthy' : 'degraded',
        cloudinary: cloudinaryTest.success ? 'healthy' : 'unhealthy',
        whatsapp: whatsappTest.success ? 'healthy' : 'unhealthy',
        database: dbHealthy ? 'healthy' : 'unhealthy',
        tempDirectory: tempDirExists ? 'healthy' : 'unhealthy'
      },
      details: {
        cloudinary: cloudinaryTest,
        whatsapp: whatsappTest,
        database: { connected: dbHealthy },
        tempDirectory: {
          exists: tempDirExists,
          path: tempDir
        }
      },
      configuration: {
        cloudName: 'ddmzeqpkc',
        certificateFolder: 'certificates',
        storageMethod: 'cloudinary'
      },
      checkedAt: new Date().toISOString(),
      checkedBy: 'saikiran11461',
      serverTime: new Date().toISOString(),
      apiVersion: "2.0.0"
    });
  } catch (error) {
    console.error(' Certificate system health check failed by saikiran11461:', error);
    res.status(500).json({
      status: "error",
      message: error.message,
      health: {
        overall: 'unhealthy'
      },
      timestamp: new Date().toISOString(),
      checkedBy: 'saikiran11461',
      apiVersion: "2.0.0"
    });
  }
},

sendTemplate: async (req, res) => {
  try {
    const users = await Candidate.find({
      paymentStatus: "Paid"
    });

    const isValidWhatsAppNumber = (number) => {
      const cleaned = (number || "").replace(/\D/g, "");
      return /^91\d{10}$/.test(cleaned);
    };

    const validUsers = users.filter(user =>
      isValidWhatsAppNumber(user.whatsappNumber)
    );

    console.log("Total candidates:", users.length);
    console.log("Valid numbers:", validUsers.length);

    const templateId = "ce707c05-54ef-4e80-b0fd-c0f9885288f6";

    let results = [];
    let count = 0;
    for (const user of validUsers) {
      count++;

      const normalizedNumber = user.whatsappNumber.replace(/\D/g, "");
      try {
        const message = await gupshup.sendingTextTemplate(
          {
            template: { id: templateId, params: [user.name, "4 PM"] },
            'src.name': 'Production',
            destination: normalizedNumber,
            source: '917075176108',
          },
          { apikey: 'zbut4tsg1ouor2jks4umy1d92salxm38' }
        );
        console.log(message.data);
        results.push({ user: user.name, number: normalizedNumber, status: "sent", response: message.data });
      } catch (err) {
        console.error(`Failed for ${user.name} (${normalizedNumber}):`, err.message);
        results.push({ user: user.name, number: normalizedNumber, status: "failed", error: err.message });
      }
    }

    return res.send({
      total: users.length,
      valid: validUsers.length,
      results
    });

  } catch (err) {
    console.error("Error sending template:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
  
};


module.exports = { CandidateController };