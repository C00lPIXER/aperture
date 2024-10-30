const User = require("../../Models/userModel");
const Category = require("../../Models/categoryModel");
const Brands = require("../../Models/brandsModel");
const Product = require("../../Models/productModel");
const Address = require("../../Models/userAddress");
const Cart = require("../../Models/cartModel");
const Order = require("../../Models/orderModel");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const path = require("path");
const moment = require("moment");
// const ExcelJS = require('exceljs');

const loadSales = async (req, res) => {
  try {
    res.render("salesReport", { orders: null, reportData: null });
  } catch (error) {
    console.error(error.message);
  }
};

const generateReport = async (req, res) => {
  try {
    const { reportType } = req.body;
    const startDate = req.body.startDate || moment().startOf("week");
    const endDate = req.body.endDate || moment().startOf("week");
    let start, end;

    switch (reportType) {
      case "weekly":
        start = moment().startOf("week");
        end = moment().endOf("week");
        break;
      case "monthly":
        start = moment().startOf("month");
        end = moment().endOf("month");
        break;
      case "yearly":
        start = moment().startOf("year");
        end = moment().endOf("year");
        break;
      case "custom":
        start = moment(startDate).startOf("day");
        end = moment(endDate).endOf("day");
        break;
      default:
        start = moment().startOf("day");
        end = moment().endOf("day");
    }

    const orders = await Order.find({
      placedAt: { $gte: start.toDate(), $lte: end.toDate() },
    }).populate("userId");

    const reportData = {
      totalSales: orders.reduce((sum, order) => sum + order.totalPrice, 0),
      totalDiscount: orders.reduce(
        (sum, order) => sum + (order.discount || 0),
        0
      ),
      couponDeductions: orders.reduce(
        (sum, order) => sum + (order.couponCode ? order.discount : 0),
        0
      ),
      ordersCount: orders.length,
    };

    res.render("salesReport", { orders, reportData });
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Error generating the report");
  }
};

const downloadPDFReport = async (req, res) => {


  const orders = await Order.find({
    placedAt: { $gte: start.toDate(), $lte: end.toDate() },
  }).populate("userId");

  const reportData = {
    totalSales: orders.reduce((sum, order) => sum + order.totalPrice, 0),
    totalDiscount: orders.reduce(
      (sum, order) => sum + (order.discount || 0),
      0
    ),
    couponDeductions: orders.reduce(
      (sum, order) => sum + (order.couponCode ? order.discount : 0),
      0
    ),
    ordersCount: orders.length,
  };

  const doc = new PDFDocument();
  let filename = `Sales_Report_${Date.now()}.pdf`;
  res.setHeader("Content-disposition", `attachment; filename=${filename}`);
  res.setHeader("Content-type", "application/pdf");

  doc.pipe(res);

  doc.fontSize(16).text("Sales Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Total Sales: ₹${reportData.totalSales.toFixed(2)}`);
  doc.text(`Total Discounts: ₹${reportData.totalDiscount.toFixed(2)}`);
  doc.text(`Coupon Deductions: ₹${reportData.couponDeductions.toFixed(2)}`);
  doc.text(`Total Orders: ${reportData.ordersCount}`);
  doc.moveDown();

  // Orders Table
  doc.fontSize(14).text("Order Details:", { underline: true });

  orders.forEach((order) => {
    doc.fontSize(10).text(`Order ID: ${order._id}`);
    doc.text(`Customer: ${order.userId.email}`);
    doc.text(`Quantity: ${order.items.length}`);
    doc.text(`Total: ₹${order.totalPrice.toFixed(2)}`);
    doc.text(`Status: ${order.orderStatus}`);
    doc.text(`Order Placed: ${new Date(order.placedAt).toDateString()}`);
    doc.moveDown();
  });

  doc.end();
};

const downloadExcelReport = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "id", width: 20 },
      { header: "Customer", key: "customer", width: 30 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Total", key: "total", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Order Placed", key: "date", width: 20 },
    ];

    Order.forEach((order) => {
      worksheet.addRow({
        id: order._id,
        customer: order.userId.email,
        quantity: order.items.length,
        total: order.totalPrice.toFixed(2),
        status: order.orderStatus,
        date: new Date(order.placedAt).toDateString(),
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Sales_Report_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error.message);
  }
};

module.exports = {
  loadSales,
  generateReport,
  downloadPDFReport,
  downloadExcelReport,
};