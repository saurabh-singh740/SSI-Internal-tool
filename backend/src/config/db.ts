import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/admin_project_setup';
    const conn = await mongoose.connect(mongoUri, {
      maxPoolSize: 20, // max concurrent connections (default 5 is too low under load)
      minPoolSize: 5,  // keep warm connections to avoid cold-start latency
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
