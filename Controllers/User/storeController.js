const User = require("../../Models/userModel");
const Product = require("../../Models/productModel");
const Category = require("../../Models/categoryModel");
const Address = require("../../Models/userAddress");
const Brand = require("../../Models/brandsModel");
const Cart = require("../../Models/cartModel");
const Order = require("../../Models/orderModel");
const Wishlist = require("../../Models/wishlistModel");
const Review = require("../../Models/reviewModel");
const Wallet = require("../../Models/walletModel");
const Coupon = require("../../Models/couponModel");
require("dotenv").config();

//* shop
const loadHomePage = async (req, res) => {
  try {
    const userId = req.session.user;
    const wishlist = await Wishlist.findOne({ userId });
    const activeProducts = await Product.find({
      is_Active: true,
      stock: { $gt: 0 },
    })
      .populate({
        path: "category",
        select: "name",
        match: { is_Active: true },
      })
      .populate({ path: "brand", select: "name", match: { is_Active: true } })
      .limit(12);

    const product = activeProducts.filter(
      (product) => product.category && product.brand
    );

    res.render("home", { product, wishlist });
  } catch (error) {
    console.error(error.message);
  }
};

const loadShopPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || "";
    const selectedBrands = req.query.brand ? req.query.brand.split(",") : [];
    const selectedCategories = req.query.category
      ? req.query.category.split(",")
      : [];
    const sort = req.query.sort;

    const userId = req.session.user;
    const allCategories = await Category.find();
    const allBrands = await Brand.find();
    const wishlist = await Wishlist.findOne({ userId });

    const categories = await Category.find({
      name: { $in: selectedCategories },
    });
    const brands = await Brand.find({ name: { $in: selectedBrands } });

    const categoryIds = categories.map((category) => category._id);
    const brandIds = brands.map((brand) => brand._id);

    const searchTerms = search.trim().split(/\s+/);
    const regexPatterns = searchTerms.map(
      (term) => new RegExp(`\\b${term}\\b`, "i")
    );

    const filterQuery = {
      is_Active: true,
      ...(search
        ? {
            $or: [
              { name: { $in: regexPatterns } },
              { description: { $in: regexPatterns } },
            ],
          }
        : {}),
      ...(brandIds.length > 0 && { brand: { $in: brandIds } }),
      ...(categoryIds.length > 0 && { category: { $in: categoryIds } }),
    };

    const activeProducts = await Product.find(filterQuery)
      .sort(getSortOrder(sort))
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    const totalFilteredProducts = await Product.countDocuments(filterQuery);

    res.render("shop", {
      categories,
      allBrands,
      allCategories,
      totalProducts: totalFilteredProducts,
      activeProducts,
      brands,
      currentPage: page,
      totalPages: Math.ceil(totalFilteredProducts / limit),
      limit,
      search,
      category: selectedCategories,
      selectedCategories,
      brand: selectedBrands,
      selectedBrands,
      sort,
      wishlist,
    });
  } catch (error) {
    console.error(error.message);
  }
};

const getSortOrder = (sort) => {
  switch (sort) {
    case "popularity":
      return { ratings: -1 };
    case "newness":
      return { createdAt: -1 };
    case "priceAsc":
      return { price: 1 };
    case "priceDesc":
      return { price: -1 };
    case "nameDesc":
      return { name: -1 };
    case "nameAsc":
      return { name: 1 };
    default:
      return;
  }
};

const productDetail = async (req, res) => {
  try {
    const productId = req.query.product;
    const userId = req.session.user;
    let wishlist =  await Wishlist.findOne({ userId });
    const product = await Product.findOne({_id: productId})
      .populate("category")
      .populate("brand");
    const reviews = await Review.find({ productId: productId }).populate(
      "userId"
    );

    const relatedProduct = await Product.find({
      category: product.category._id,
      is_Active: true,
      _id: { $ne: product._id },
    }).limit(8);

    res.render("productDetail", { product, relatedProduct, reviews, wishlist });
  } catch (error) {
    console.error(error.message);
  }
};

//* cart
const loadCartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    let cart = await Cart.findOne({ userId }).populate("items.productId");
    const coupon = await Coupon.findOne({ code: cart.couponCode });

    if (cart && cart.items.length > 0) {
      const items = cart.items.map((item) => ({
        product: item.productId,
        _id: item._id,
      }));

      if (cart && cart.items.length > 0 && cart.couponCode) {
        cart.discount = 0;
        cart.couponCode = null;
        await cart.save();
        coupon.usedCount -= 1;
        await coupon.save();
      }

      for (let i = 0; i < items.length; i++) {
        if (items[i].product.stock < 1) {
          await Cart.findOneAndUpdate(
            { _id: cart._id },
            { $pull: { items: { productId: items[i].product._id } } }
          );
        }
      }
      cart = await Cart.findOne({ userId }).populate("items.productId");
    }

    if (cart && cart.items.length > 0) {
      cart.totalPrice = cart.items.reduce(
        (total, item) => total + item.productId.price * item.quantity,
        0
      );
    }
    res.render("cart", { cart });
  } catch (error) {
    console.error("cart", error.message);
  }
};

const addToCart = async (req, res) => {
  try {
    const productId = req.body.id;
    const userId = req.session.user;
    const product = await Product.findById(productId);

    if (userId) {
      if (product.stock > 0) {
        let cart = await Cart.findOne({ userId });

        if (cart) {
          const itemIndex = cart.items.findIndex(
            (item) => item.productId == productId
          );

          if (itemIndex > -1) {
            return res.json({ success: true, info: "Item already in cart" });
          } else {
            cart.items.push({ productId, quantity: 1, price: product.price });
          }
        } else {
          cart = new Cart({
            userId,
            items: [{ productId, quantity: 1, price: product.price }],
          });
        }
        await cart.save();
        res.json({
          success: true,
          message: "Item added to cart",
        });
      } else {
        res.json({
          success: true,
          info: "Item curently out of stock ",
        });
      }
    } else {
      res.json({
        success: true,
        info: "Please log in to continue!",
      });
    }
  } catch (error) {
    console.error(error.message);
  }
};

const selectQuantity = async (req, res) => {
  try {
    const { productId, isIncrement } = req.body;
    const userId = req.session.user;

    const cart = await Cart.findOne({ userId, "items.productId": productId });
    const product = await Product.findOne({ _id: productId });
    const item = cart.items.find(
      (item) => item.productId.toString() === productId.toString()
    );

    if (item) {
      if (isIncrement === "1") {
        if (item.quantity < 5 && item.quantity < product.stock) {
          await Cart.updateOne(
            { userId, "items.productId": productId },
            { $inc: { "items.$.quantity": 1 } }
          );
        } else {
          return res.json({
            success: false,
            message: "Cannot exceed maximum quantity or stock limit",
          });
        }
      } else if (item.quantity > 1) {
        await Cart.updateOne(
          { userId, "items.productId": productId },
          { $inc: { "items.$.quantity": -1 } }
        );
      } else {
        return res.json({
          success: false,
          message: "Quantity cannot be less than 1",
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const productId = req.body.id;
    const userId = req.session.user;

    await Cart.findOneAndUpdate(
      { userId: userId },
      { $pull: { items: { productId: productId } } }
    );

    res.json({ success: true, message: "Item removed" });
  } catch (error) {
    console.error(error.message);
  }
};

//* proceed to checkout
const loadCheckOutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).populate("addresses");
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const coupon = await Coupon.find();
    if (cart && cart.items.length > 0) {
      cart.totalPrice = cart.items.reduce(
        (total, item) => total + item.productId.price * item.quantity,
        0
      );
      cart.save();
      res.render("checkOut", { cart, user, coupon });
    } else {
      res.redirect("/cart");
    }
  } catch (error) {
    console.error(error.message);
  }
};

const createOrder = async (req, res) => {
  try {
    const { shippingAddressId, paymentMethod, totalPrice } = req.body;

    if (totalPrice > 5000 && paymentMethod === "Cash on Delivery") {
      return res.json({
        success: false,
        message: "Order above ₹5000 does not support Cash on Delivery",
      });
    }

    const userId = req.session.user;
    const cart = await Cart.findOne({ userId });
    const shippingAddress = await Address.findById(shippingAddressId);

    if (!shippingAddress) {
      return res.json({
        success: false,
        message: "Please make sure you select an address",
      });
    }

    const items = cart.items.map((item) => ({
      product: item.productId,
      quantity: item.quantity,
      price: item.price,
    }));

    const newOrder = new Order({
      userId: userId,
      shippingAddress: {
        name: shippingAddress.name,
        mobile: shippingAddress.mobile,
        pincode: shippingAddress.pincode,
        locality: shippingAddress.locality,
        city: shippingAddress.city,
        state: shippingAddress.state,
        landmark: shippingAddress.landmark,
        type: shippingAddress.type,
      },
      items: items,
      paymentMethod: paymentMethod,
      totalPrice: totalPrice,
      discount: cart.discount,
      couponCode: cart.couponCode,
    });

    let savedOrder

    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (wallet.balance < totalPrice) {
        return res.json({
          success: false,
          message: `Your account currently has insufficient balance`,
        });
      }
      wallet.balance -= totalPrice;
      wallet.walletHistory.push({
        transactionType: "debit",
        amount: totalPrice,
        description: "Purchase",
      });
      newOrder.paymentStatus = "Completed"
      savedOrder = await newOrder.save();
      await wallet.save();
    }else{
      savedOrder = await newOrder.save();
    }
    if (savedOrder) {
      await Cart.findByIdAndDelete({ _id: cart._id });

      for (let item of items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: -item.quantity },
        });
      }
    }

    res.json({ success: true, message: "Order created successfully" });
  } catch (error) {
    console.error(error.message);
  }
};

const cancelOrder = async (req, res) => {
  try {
    const orderId = req.body.orderId;
    const userId = req.session.user;
    const findedOrder = await Order.findById(orderId);
    const amount = findedOrder.totalPrice;

    if (findedOrder.orderStatus !== "Cancelled") {
      const order = await Order.findByIdAndUpdate(orderId, {
        orderStatus: "Cancelled",
      });

      if (
        findedOrder.paymentMethod === "Wallet" ||
        findedOrder.paymentMethod === "PayPal"
      ) {
        const wallet = await Wallet.findOne({ userId: userId });
        if (wallet) {
          wallet.balance += amount;
          wallet.walletHistory.push({
            transactionType: "credit",
            amount: amount,
            description: "Refund",
          });
          await wallet.save();
        } else {
          const newWallet = new Wallet({
            userId,
            balance: amount,
            walletHistory: [
              {
                transactionType: "credit",
                amount: amount,
                description: "Refund",
              },
            ],
          });
          await newWallet.save();
        }
      }

      for (let item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity },
        });
      }

      res.json({ status: true, message: "Order cancelled" });
    } else {
      res.json({ status: true, message: "This order is already cancelled" });
    }
  } catch (error) {
    console.error("cancelOrder:", error.message);
  }
};

const returnOrder = async (req, res) => {
  try {
    const orderId = req.body.orderId;
    const userId = req.session.user;
    const findedOrder = await Order.findById(orderId);
    const amount = findedOrder.totalPrice;

    if (findedOrder.orderStatus !== "Returned") {
      const order = await Order.findByIdAndUpdate(orderId, {
        orderStatus: "Returned",
      });

      if (
        findedOrder.paymentMethod === "Wallet" ||
        findedOrder.paymentMethod === "PayPal"
      ) {
        const wallet = await Wallet.findOne({ userId: userId });
        if (wallet) {
          wallet.balance += amount;
          wallet.walletHistory.push({
            transactionType: "credit",
            amount: amount,
            description: "Refund",
          });
          await wallet.save();
        } else {
          const newWallet = new Wallet({
            userId,
            balance: amount,
            walletHistory: [
              {
                transactionType: "credit",
                amount: amount,
                description: "Refund",
              },
            ],
          });
          await newWallet.save();
        }
      }

      for (let item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity },
        });
      }

      res.json({ status: true, message: "Order Returned" });
    } else {
      res.json({ status: true, message: "This order is already Returned" });
    }
  } catch (error) {
    console.error("cancelOrder:", error.message);
  }
};

const successPage = async (req, res) => {
  try {
    res.render("success");
  } catch (error) {
    console.error(error.message);
  }
};

module.exports = {
  loadHomePage,
  productDetail,
  loadShopPage,
  loadCartPage,
  addToCart,
  removeFromCart,
  selectQuantity,
  loadCheckOutPage,
  createOrder,
  cancelOrder,
  successPage,
  returnOrder,
};
