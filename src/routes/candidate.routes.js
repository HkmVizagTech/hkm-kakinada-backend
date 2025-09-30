const express = require('express');
const { CandidateController } = require('../controllers/Candidate.controller');
const { authenticateToken, requireRole } = require('../middlewares/auth.middleware');
const CandidateRouter = express.Router();


CandidateRouter.get("/attendance-list", authenticateToken, requireRole(['admin']), CandidateController.attendanceList);
CandidateRouter.get("/admin/scanned-list", authenticateToken, requireRole(['admin', 'user']), CandidateController.adminScannedList);
CandidateRouter.get("/eligible-for-certificate", authenticateToken, requireRole(['admin']), CandidateController.getEligibleCandidatesForCertificate);
CandidateRouter.get("/verify-payment/:id", CandidateController.verifyPaymentId);
CandidateRouter.get("/send", authenticateToken, requireRole(['admin']), CandidateController.sendTemplate);


CandidateRouter.get("/certificate-statistics", authenticateToken, requireRole(['admin']), CandidateController.getCertificateStatistics);
CandidateRouter.get("/certificate-system-health", authenticateToken, requireRole(['admin']), CandidateController.getCertificateSystemHealth);
CandidateRouter.get("/certificate/:documentId", CandidateController.getCertificateByDocumentId);


CandidateRouter.get('/', authenticateToken, requireRole(['admin']), CandidateController.getAllCandidates);           


CandidateRouter.post('/send-certificates', authenticateToken, requireRole(['admin']), CandidateController.sendCertificates);
CandidateRouter.post('/send-single-certificate', authenticateToken, requireRole(['admin']), CandidateController.sendSingleCertificate);
CandidateRouter.post('/resend-certificate', authenticateToken, requireRole(['admin']), CandidateController.resendCertificate); 
CandidateRouter.post('/create-order', CandidateController.createOrder);   
CandidateRouter.post('/verify-payment', CandidateController.verifyPayment); 
CandidateRouter.post('/', CandidateController.createCandidate);           
CandidateRouter.post('/webhook', CandidateController.webhook);
CandidateRouter.post("/mark-attendance", CandidateController.markAttendance);
CandidateRouter.post('/admin/attendance-scan', authenticateToken, requireRole(['admin', 'user']), CandidateController.adminAttendanceScan);
CandidateRouter.post('/generate-single-certificate', authenticateToken, requireRole(['admin']), CandidateController.generateSingleCertificateOnly);


CandidateRouter.put('/:id', authenticateToken, requireRole(['admin']), CandidateController.updateCandidate);     
CandidateRouter.delete('/asm', authenticateToken, requireRole(['admin']), CandidateController.deleteByName);
CandidateRouter.delete('/:id', authenticateToken, requireRole(['admin']), CandidateController.deleteCandidate);     


CandidateRouter.get('/:id', CandidateController.getCandidateById);   

module.exports = { CandidateRouter };